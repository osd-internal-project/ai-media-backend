import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { createHash, createHmac } from 'crypto';
import * as https from 'https';

const ASSET_API_VERSION = '2024-01-01';
const ASSET_SERVICE = 'ark';

/** asset ที่สร้างให้งานหนึ่ง — เก็บไว้ลบตอนงานจบ */
export interface TaskAssets {
  groupId: string;
  assetIds: string[];
}

interface ContentItem {
  type: string;
  image_url?: { url: string };
}

interface OpenApiResponse {
  ResponseMetadata?: { Error?: { Code?: string; Message?: string } };
  Result?: Record<string, unknown>;
}

type AssetErrorKind = 'auth' | 'rate' | 'rejected' | 'timeout' | 'other';

/** error ภายใน — message มีรายละเอียด provider (ห้ามส่งถึงผู้ใช้), kind ใช้เลือกข้อความผู้ใช้ */
export class AssetApiError extends Error {
  constructor(message: string, readonly kind: AssetErrorKind) {
    super(message);
  }
}

const USER_MESSAGES: Record<AssetErrorKind, string> = {
  rejected:
    "Your reference image couldn't be used. Please try a different image.",
  timeout: 'Preparing your reference image took too long. Please try again.',
  rate: 'The service is busy right now. Please try again in a moment.',
  auth: "We couldn't prepare your reference image right now. Please try again later.",
  other:
    "We couldn't prepare your reference image right now. Please try again later.",
};

const AUTH_CODES = /InvalidAccessKey|SignatureDoesNotMatch|AccessDenied/i;
const RATE_CODES = /Limit|Throttl/i;

const classify = (status: number | undefined, code = ''): AssetErrorKind => {
  if (status === 401 || status === 403 || AUTH_CODES.test(code)) return 'auth';
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
      const groupId = await this.createGroup(taskId);
      assets = { groupId, assetIds: [] };
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
      const kind = error instanceof AssetApiError ? error.kind : 'other';
      // รายละเอียดเต็มไว้ debug ใน log เท่านั้น — ผู้ใช้เห็นแค่ USER_MESSAGES
      this.logger.error(
        `[${taskId}] ❌ asset step failed (${kind}): ${
          (error as Error).message
        }`,
      );
      await this.cleanup(taskId, assets);
      throw new Error(USER_MESSAGES[kind]);
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

  private async createGroup(taskId: string): Promise<string> {
    const res = await this.call('CreateAssetGroup', {
      Name: `task-${taskId}`,
      Description: `seedance2 task ${taskId}`,
      ProjectName: this.projectName,
    });
    const id = String(res.Id ?? '');
    if (!id)
      throw new AssetApiError('CreateAssetGroup returned no Id', 'other');
    this.logger.log(`[${taskId}] asset group created ${id}`);
    return id;
  }

  private async createAsset(groupId: string, url: string): Promise<string> {
    const res = await this.call('CreateAsset', {
      GroupId: groupId,
      URL: url,
      AssetType: 'Image',
      ProjectName: this.projectName,
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
        throw new AssetApiError(`asset ${assetId} Failed`, 'rejected');
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
    try {
      const res = await axios.post<OpenApiResponse>(
        `https://${this.host}/?${query}`,
        payload,
        { headers, httpsAgent: this.agent },
      );
      const apiError = res.data?.ResponseMetadata?.Error;
      if (apiError) {
        throw new AssetApiError(
          `${action}: ${apiError.Code} ${apiError.Message}`,
          classify(res.status, apiError.Code),
        );
      }
      return res.data?.Result ?? {};
    } catch (error: unknown) {
      if (!axios.isAxiosError(error)) throw error;
      const status = error.response?.status;
      const apiError = (error.response?.data as OpenApiResponse | undefined)
        ?.ResponseMetadata?.Error;
      throw new AssetApiError(
        `${action}: ${status ?? ''} ${
          apiError ? `${apiError.Code} ${apiError.Message}` : error.message
        }`,
        classify(status, apiError?.Code),
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
