import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { createHash, createHmac } from 'crypto';
import * as https from 'https';
import { InjectRedis } from '@nestjs-modules/ioredis';
import { Redis } from 'ioredis';
import {
  assetCreateQpm,
  lockGroupCreation,
  releaseGroupSlots,
  reserveGroupSlots,
  retireGroup,
  setCurrentGroup,
  takeAssetCreateTokens,
  unlockGroupCreation,
} from './asset-quota';

const ASSET_API_VERSION = '2024-01-01';
const ASSET_SERVICE = 'ark';

/** asset ที่สร้างให้งานหนึ่ง — เก็บไว้ลบตอนงานจบ */
export interface TaskAssets {
  groupId: string;
  assetIds: string[];
  /** slots reserved in the shared group pool; absent = legacy per-task group (delete the group) */
  slots?: number;
}

interface ContentItem {
  type: string;
  image_url?: { url: string };
}

interface OpenApiResponse {
  ResponseMetadata?: { Error?: { Code?: string; Message?: string } };
  Result?: Record<string, unknown>;
}

type AssetErrorKind =
  | 'auth'
  | 'rate'
  | 'rejected'
  | 'missing'
  | 'timeout'
  | 'network'
  | 'other';

/** error ภายใน — message มีรายละเอียด provider (ห้ามส่งถึงผู้ใช้), kind ใช้เลือกข้อความผู้ใช้ */
export class AssetApiError extends Error {
  constructor(
    message: string,
    readonly kind: AssetErrorKind,
    readonly code?: string,
  ) {
    super(message);
  }
}

/** error ที่ส่งออกจาก service — message = ข้อความผู้ใช้, kind/code/detail ไว้บันทึกลง error_logs (detail ปิด token แล้ว) */
export class AssetStepError extends Error {
  readonly detail: string;
  constructor(
    readonly kind: AssetErrorKind,
    readonly code: string | undefined,
    detail = '',
  ) {
    super(USER_MESSAGES[kind]);
    // provider echoes the access key, e.g. "security token[AKAP...] is invalid"
    this.detail = detail.replace(/token\s*\[[^\]]*\]/gi, 'token[redacted]');
  }
}

const USER_MESSAGES: Record<AssetErrorKind, string> = {
  rejected:
    "Your reference image couldn't be used. Please try a different image.",
  missing:
    'Your reference image is no longer available. Please remove it and upload it again.',
  timeout: 'Preparing your reference image took too long. Please try again.',
  rate: 'The service is busy right now. Please try again in a moment.',
  network: "We couldn't reach the video service. Please try again in a moment.",
  // auth/other are our side, not the image — don't make the user swap a good image
  auth: 'Something went wrong preparing your video. Please try again later.',
  other: 'Something went wrong preparing your video. Please try again later.',
};

const REQUEST_TIMEOUT_MS = 30_000;
const AUTH_CODES = /InvalidAccessKey|SignatureDoesNotMatch|AccessDenied/i;
const RATE_CODES = /Limit|Throttl/i;
// Ark fetches the presigned TOS URL itself; this code means the object is gone (seen on prod: "fetch object not found")
const MISSING_CODES = /DownloadFailed/i;
// CreateAsset says the group is full or gone — stop using it and retry from the queue with a new one
const GROUP_UNUSABLE_CODES = /Quota|Exceed|NotFound/i;
// no HTTP response: connect/DNS/socket failed before BytePlus saw the request
const NETWORK_CODES =
  /^(ETIMEDOUT|ECONNRESET|ECONNREFUSED|ECONNABORTED|EAI_AGAIN|ENOTFOUND|ENETUNREACH|EHOSTUNREACH)$/;

const classify = (
  status: number | undefined,
  code = '',
  netCode = '',
): AssetErrorKind => {
  if (!status && NETWORK_CODES.test(netCode)) return 'network';
  if (status === 401 || status === 403 || AUTH_CODES.test(code)) return 'auth';
  if (MISSING_CODES.test(code)) return 'missing';
  if (status === 429 || RATE_CODES.test(code)) return 'rate';
  return 'other';
};

const sha256Hex = (data: string) =>
  createHash('sha256').update(data).digest('hex');
const hmac = (key: Buffer | string, data: string) =>
  createHmac('sha256', key).update(data).digest();

/**
 * BytePlus ModelArk Private Asset Library — seedance2 ไม่รับรูปคนจริงเป็น URL ตรง
 * ต้องอัปเป็น asset (รอ Active) แล้วอ้างเป็น `asset://<id>` ใน content
 */
@Injectable()
export class ByteplusAssetService {
  private readonly logger = new Logger(ByteplusAssetService.name);
  private readonly agent = new https.Agent({ rejectUnauthorized: false });
  pollIntervalMs = 3_000;
  waitTimeoutMs = 300_000;
  groupWaitMs = 500;
  groupWaitTries = 20;

  constructor(@InjectRedis() private readonly redis: Redis) {}

  private get host() {
    return process.env.BYTEPLUS_ARK_OPENAPI_HOST || 'open.byteplusapi.com';
  }
  private get region() {
    return process.env.BYTEPLUS_ARK_REGION || 'ap-southeast-1';
  }
  private get projectName() {
    return process.env.BYTEPLUS_ARK_PROJECT_NAME || 'default';
  }

  /**
   * แทน url ของทุก `image_url` ใน payload.content ด้วย `asset://<id>` (mutate payload)
   * @throws Error ที่ message อ่านได้สำหรับผู้ใช้ (ไม่มี key/รายละเอียด provider) — asset ที่สร้างแล้วถูกลบก่อน throw
   */
  async swapImagesToAssets(
    payload: { content?: ContentItem[] },
    taskId: string,
    onAssetReady?: (done: number, total: number) => Promise<void>,
  ): Promise<TaskAssets | null> {
    const images = (payload.content ?? []).filter(
      (c): c is ContentItem & { image_url: { url: string } } =>
        c.type === 'image_url' && Boolean(c.image_url?.url),
    );
    if (images.length === 0) return null;

    let assets: TaskAssets | null = null;
    try {
      if (!(await takeAssetCreateTokens(this.redis, images.length, taskId))) {
        throw new AssetApiError(
          `CreateAsset: account limit ${assetCreateQpm()}/min reached (${
            images.length
          } needed)`,
          'rate',
          'LOCAL_QPM',
        );
      }
      const groupId = await this.acquireGroup(taskId, images.length);
      assets = { groupId, assetIds: [], slots: images.length };
      const created = assets;
      let done = 0;
      await onAssetReady?.(0, images.length);
      await Promise.all(
        images.map(async (item) => {
          const assetId = await this.createAsset(groupId, item.image_url.url);
          created.assetIds.push(assetId);
          await this.waitActive(taskId, assetId);
          item.image_url.url = `asset://${assetId}`;
          await onAssetReady?.(++done, images.length);
        }),
      );
    } catch (error) {
      const apiError = error instanceof AssetApiError ? error : undefined;
      const stepError = new AssetStepError(
        apiError?.kind ?? 'other',
        apiError?.code,
        (error as Error).message,
      );
      // รายละเอียดเต็ม (ปิด key แล้ว) ไป log + error_logs — ผู้ใช้เห็นแค่ USER_MESSAGES
      this.logger.error(
        `[${taskId}] ❌ asset step failed (${stepError.kind}): ${stepError.detail}`,
      );
      await this.cleanup(taskId, assets);
      throw stepError;
    }
    this.logger.log(
      `[${taskId}] ${assets.assetIds.length} image(s) → asset group=${assets.groupId}`,
    );
    return assets;
  }

  /** ลบ asset + group ของงาน — ไม่ throw (งานที่สำเร็จต้องไม่กลายเป็น failed เพราะลบไม่ได้) */
  async cleanup(taskId: string, assets: TaskAssets | null | undefined) {
    if (!assets) return;
    for (const id of assets.assetIds) {
      try {
        await this.call('DeleteAsset', {
          Id: id,
          ProjectName: this.projectName,
        });
        this.logger.log(`[${taskId}] 🗑️ deleted asset ${id}`);
      } catch (error) {
        this.logger.warn(
          `[${taskId}] delete asset ${id} failed: ${(error as Error).message}`,
        );
      }
    }
    try {
      const deleteGroup =
        assets.slots === undefined ||
        (await releaseGroupSlots(this.redis, assets.groupId, assets.slots));
      if (!deleteGroup) return;
      await this.call('DeleteAssetGroup', {
        Id: assets.groupId,
        ProjectName: this.projectName,
      });
      this.logger.log(`[${taskId}] 🗑️ deleted asset group ${assets.groupId}`);
    } catch (error) {
      this.logger.warn(
        `[${taskId}] delete asset group ${assets.groupId} failed: ${
          (error as Error).message
        }`,
      );
    }
  }

  /** `n` slots in the shared pool group — creates the next group when the current one is full */
  private async acquireGroup(taskId: string, n: number): Promise<string> {
    for (let i = 0; i < this.groupWaitTries; i++) {
      const reserved = await reserveGroupSlots(this.redis, n);
      if (reserved) return reserved;
      if (await lockGroupCreation(this.redis)) {
        // another pod may have finished creating one between reserve and lock
        const raced = await reserveGroupSlots(this.redis, n);
        if (raced) {
          await unlockGroupCreation(this.redis);
          return raced;
        }
        try {
          const id = await this.createGroup(taskId);
          await setCurrentGroup(this.redis, id, n);
          return id;
        } catch (error) {
          await unlockGroupCreation(this.redis);
          throw error;
        }
      }
      await new Promise((r) => setTimeout(r, this.groupWaitMs));
    }
    throw new AssetApiError('asset group creation still locked', 'rate');
  }

  private async createGroup(taskId: string): Promise<string> {
    const res = await this.call('CreateAssetGroup', {
      Name: `pool-${Date.now()}`,
      Description: `seedance2 shared pool (first task ${taskId})`,
      ProjectName: this.projectName,
    });
    const id = String(res.Id ?? '');
    if (!id)
      throw new AssetApiError('CreateAssetGroup returned no Id', 'other');
    this.logger.log(`[${taskId}] asset group rotated → new pool group ${id}`);
    return id;
  }

  private async createAsset(groupId: string, url: string): Promise<string> {
    const res = await this.call('CreateAsset', {
      GroupId: groupId,
      URL: url,
      AssetType: 'Image',
      ProjectName: this.projectName,
    }).catch(async (error: unknown) => {
      if (
        error instanceof AssetApiError &&
        GROUP_UNUSABLE_CODES.test(error.code ?? '')
      ) {
        await retireGroup(this.redis, groupId);
        this.logger.warn(`asset group ${groupId} retired: ${error.message}`);
        throw new AssetApiError(error.message, 'rate', error.code);
      }
      throw error;
    });
    const id = String(res.Id ?? '');
    if (!id) throw new AssetApiError('CreateAsset returned no Id', 'other');
    this.logger.log(`asset created ${id} in ${groupId}`);
    return id;
  }

  private async waitActive(taskId: string, assetId: string): Promise<void> {
    const deadline = Date.now() + this.waitTimeoutMs;
    for (;;) {
      const res = await this.call('GetAsset', {
        Id: assetId,
        ProjectName: this.projectName,
      });
      const status = String(res.Status ?? '');
      if (status === 'Active') {
        this.logger.log(`[${taskId}] asset ${assetId} Active`);
        return;
      }
      if (status === 'Failed') {
        this.logger.error(
          `[${taskId}] asset ${assetId} Failed: ${JSON.stringify(res)}`,
        );
        // reason (e.g. real-person check) must reach error_logs; drop the presigned URL
        const { URL: _url, ...reason } = res;
        throw new AssetApiError(
          `asset ${assetId} Failed: ${JSON.stringify(reason).slice(0, 500)}`,
          'rejected',
        );
      }
      if (Date.now() >= deadline) {
        throw new AssetApiError(
          `asset ${assetId} timed out (status=${status})`,
          'timeout',
        );
      }
      this.logger.log(`[${taskId}] asset ${assetId} status=${status} — wait`);
      await new Promise((r) => setTimeout(r, this.pollIntervalMs));
    }
  }

  /** POST แบบ OpenAPI (AK/SK, HMAC-SHA256 V4) — คืน `Result` */
  private async call(
    action: string,
    body: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const ak = process.env.BYTEPLUS_ACCESS_KEY;
    const sk = process.env.BYTEPLUS_SECRET_KEY;
    if (!ak || !sk) {
      throw new AssetApiError(
        'BYTEPLUS_ACCESS_KEY / BYTEPLUS_SECRET_KEY not set',
        'auth',
      );
    }
    const payload = JSON.stringify(body);
    const query = `Action=${action}&Version=${ASSET_API_VERSION}`;
    const headers = this.sign(ak, sk, query, payload);
    const start = Date.now();
    try {
      const res = await axios.post<OpenApiResponse>(
        `https://${this.host}/?${query}`,
        payload,
        { headers, httpsAgent: this.agent, timeout: REQUEST_TIMEOUT_MS },
      );
      const apiError = res.data?.ResponseMetadata?.Error;
      if (apiError) {
        throw new AssetApiError(
          `${action}: ${apiError.Code} ${apiError.Message}`,
          classify(res.status, apiError.Code),
          apiError.Code,
        );
      }
      return res.data?.Result ?? {};
    } catch (error: unknown) {
      if (!axios.isAxiosError(error)) throw error;
      const status = error.response?.status;
      const apiError = (error.response?.data as OpenApiResponse | undefined)
        ?.ResponseMetadata?.Error;
      // no response = network failure; Node's dual-stack connect gives AggregateError with an empty message — keep code + per-address errors
      // as: CI resolves an older axios whose AxiosError type has no `cause`; Node sets it at runtime
      type NetError = NodeJS.ErrnoException & {
        address?: string;
        port?: number;
      };
      const { cause } = error as Error & {
        cause?: NetError & { errors?: NetError[] };
      };
      const addr = (e?: NetError) =>
        e?.address
          ? `${e.code ?? ''} ${e.address}${e.port ? `:${e.port}` : ''}`
          : '';
      const attempts = [addr(cause), ...(cause?.errors ?? []).map(addr)];
      throw new AssetApiError(
        `${action}: ${status ?? ''} ${
          apiError
            ? `${apiError.Code} ${apiError.Message}`
            : [error.code, error.message, ...attempts].filter(Boolean).join(' ')
        } (host=${this.host} ${Date.now() - start}ms)`,
        classify(status, apiError?.Code, error.code),
        apiError?.Code ?? (status ? `HTTP ${status}` : error.code),
      );
    }
  }

  private sign(ak: string, sk: string, query: string, payload: string) {
    const xDate = new Date().toISOString().replace(/[-:]|\.\d{3}/g, '');
    const date = xDate.slice(0, 8);
    const contentSha = sha256Hex(payload);
    const contentType = 'application/json';
    const signedHeaders = 'content-type;host;x-content-sha256;x-date';
    const canonicalRequest = [
      'POST',
      '/',
      query, // Action/Version เรียงตามตัวอักษรอยู่แล้ว และไม่มีอักขระที่ต้อง encode
      `content-type:${contentType}\nhost:${this.host}\nx-content-sha256:${contentSha}\nx-date:${xDate}\n`,
      signedHeaders,
      contentSha,
    ].join('\n');
    const scope = `${date}/${this.region}/${ASSET_SERVICE}/request`;
    const stringToSign = [
      'HMAC-SHA256',
      xDate,
      scope,
      sha256Hex(canonicalRequest),
    ].join('\n');
    const kSigning = hmac(
      hmac(hmac(hmac(sk, date), this.region), ASSET_SERVICE),
      'request',
    );
    const signature = createHmac('sha256', kSigning)
      .update(stringToSign)
      .digest('hex');
    return {
      'Content-Type': contentType,
      Host: this.host,
      'X-Date': xDate,
      'X-Content-Sha256': contentSha,
      Authorization: `HMAC-SHA256 Credential=${ak}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    };
  }
}
