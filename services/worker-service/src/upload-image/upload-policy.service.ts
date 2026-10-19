import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';
import {
  PostPolicy,
  PromptGuideImageRepository,
  RefImageRepository,
  StorageUrlService,
  TosService,
  buildPromptGuideKey,
  buildUploadKey,
} from '@ai-media/share';
import { tosConfigs } from '../configs';
import { DirectUploadKind } from './upload-image.service';
import {
  MAX_BYTES_BY_MEDIA,
  MEDIA_TYPES,
  UploadMediaType,
  isAllowedUpload,
  mediaTypeOfMime,
  toUploadGenerateType,
} from './upload-rules';

export type { UploadMediaType } from './upload-rules';

/**
 * policy ใช้ซ้ำได้ภายในอายุ (frontend cache ไว้และขอใหม่ก่อนหมด 2 นาที)
 * — สั้นไว้เพราะ policy ที่รั่วใช้ upload/เขียนทับได้ทั้ง prefix (เดิม 1 ชม.)
 */
const POLICY_EXPIRES_SEC = 15 * 60;
/** upload ที่เริ่มก่อนหมดอายุอาจ callback หลังหมดอายุเล็กน้อย */
const CALLBACK_GRACE_MS = 15 * 60 * 1000;
/** ส่วนท้าย key หลัง uid: ไม่มีนามสกุล หรือนามสกุลเดียว (frontend ใช้ `${prefix}${uid}${ext}`) */
const KEY_EXTENSION = /^(\.[^./]*)?$/;

export interface UploadPolicyQuery {
  kind: DirectUploadKind;
  organizationId: string;
  userId: string;
  mediaType: UploadMediaType;
  /** kind = 'ref' */
  projectId?: string;
  /** kind = 'prompt-guide' */
  promptGuideId?: string;
}

/** ค่าที่ worker กำหนดเอง — ฝังใน callback body (ล็อกใน policy) และเซ็นด้วย token */
interface UploadScope {
  kind: DirectUploadKind;
  organizationId: string;
  userId: string;
  projectId?: string;
  promptGuideId?: string;
  /** ชนิดที่ขอ policy มา — callback ใช้ตรวจขนาดตามชนิด (ไม่มีใน policy ที่ออกก่อน deploy) */
  mediaType?: UploadMediaType;
  expiresAt: number;
}

/** body ที่ TOS ส่งมาที่ `/upload/callback` (ตาม callbackBody ใน policy) */
export interface UploadCallbackBody {
  bucket?: string;
  key?: string;
  size?: number | string;
  mimeType?: string;
  uid?: string;
  name?: string;
  index?: number | string;
  generateType?: string;
  scope?: string;
  token?: string;
}

/**
 * Browser upload แบบ PostObject + upload callback:
 * worker ออก policy (ใช้ซ้ำได้ใน prefix) → browser POST ตรงเข้า TOS → TOS เรียก callback
 * แบบ sync ให้ worker สร้าง row แล้วส่ง response ของ worker กลับให้ browser ในครั้งเดียว
 */
@Injectable()
export class UploadPolicyService {
  private readonly logger = new Logger(UploadPolicyService.name);

  constructor(
    private readonly tosService: TosService,
    private readonly refImageRepository: RefImageRepository,
    private readonly promptGuideImageRepository: PromptGuideImageRepository,
    private readonly storageUrl: StorageUrlService,
  ) {}

  /**
   * @throws BadRequestException เมื่อ query ไม่ครบ · InternalServerErrorException เมื่อไม่ได้ตั้ง `WORKER_PUBLIC_URL`
   */
  createPolicy(query: UploadPolicyQuery): PostPolicy {
    const publicUrl = process.env.WORKER_PUBLIC_URL;
    if (!publicUrl) {
      throw new InternalServerErrorException(
        'WORKER_PUBLIC_URL is not set — TOS cannot reach the upload callback',
      );
    }
    if (!query.organizationId || !query.userId) {
      throw new BadRequestException('organizationId and userId are required');
    }
    if (!MEDIA_TYPES.includes(query.mediaType)) {
      throw new BadRequestException(
        `Unsupported mediaType: ${query.mediaType}`,
      );
    }
    const scope: UploadScope = {
      kind: query.kind,
      organizationId: query.organizationId,
      userId: query.userId,
      projectId: query.projectId,
      promptGuideId: query.promptGuideId,
      mediaType: query.mediaType,
      expiresAt: Date.now() + POLICY_EXPIRES_SEC * 1000,
    };
    const keyPrefix = this.keyPrefix(scope);
    const encodedScope = Buffer.from(JSON.stringify(scope)).toString(
      'base64url',
    );
    // ตัวแปร TOS ห้ามใส่ quote — TOS ใส่ให้เอง; ค่าคงที่ของเราเป็น base64url จึงไม่ทำ JSON พัง
    const body =
      '{"bucket":${bucket},"key":${object},"size":${size},"mimeType":${mimeType},' +
      '"uid":${x:uid},"name":${x:name},"index":${x:index},"generateType":${x:generateType},' +
      `"scope":"${encodedScope}","token":"${this.sign(encodedScope)}"}`;

    return this.tosService.createPostPolicy({
      keyPrefix,
      contentTypePrefix: `${query.mediaType}/`,
      maxBytes: MAX_BYTES_BY_MEDIA[query.mediaType],
      expiresSec: POLICY_EXPIRES_SEC,
      callback: {
        url: `${publicUrl.replace(/\/$/, '')}/upload/callback`,
        body,
      },
    });
  }

  /**
   * TOS เรียกหลังเก็บไฟล์แล้ว — response นี้ถูกส่งต่อให้ browser
   * @returns shape เดียวกับ upload endpoint เดิม `{ uid, name, url, imagePath, status }`
   * @throws ForbiddenException เมื่อ token/scope/key ไม่ผ่าน (กันคนยิง callback ตรงเอง)
   */
  async handleCallback(body: UploadCallbackBody) {
    const scope = this.verifyScope(body.scope, body.token);
    const key = body.key ?? '';
    const uid = body.uid ?? '';
    const prefix = this.keyPrefix(scope);
    if (!uid || !key.startsWith(prefix)) {
      throw new ForbiddenException('Upload key is outside the signed scope');
    }
    // uid มาจาก client — ต้องเป็นชื่อไฟล์ของ key นี้จริง ไม่งั้นสร้าง row ที่ชี้ไฟล์อื่นได้
    const rest = key.slice(prefix.length);
    if (!rest.startsWith(uid) || !KEY_EXTENSION.test(rest.slice(uid.length))) {
      throw new ForbiddenException('Upload uid does not match the object key');
    }

    const bucket = tosConfigs().tosBucket;
    // ยืนยันว่าไฟล์อยู่ใน TOS จริง — กัน request ที่ปลอมเป็น TOS พร้อม token ที่เคยเห็น
    const head = await this.tosService.headObject(bucket, key);
    if (!head) throw new ForbiddenException(`Object ${key} does not exist`);
    const rawType = head['content-type'];
    const contentType =
      typeof rawType === 'string' ? rawType : body.mimeType ?? '';
    const size = Number(head['content-length'] ?? body.size ?? 0);
    const mediaType = mediaTypeOfMime(contentType);
    if (
      !isAllowedUpload(contentType, size) ||
      (scope.mediaType && mediaType !== scope.mediaType)
    ) {
      // policy ล็อกได้แค่ prefix ของ Content-Type — ไฟล์ที่ไม่อยู่ใน whitelist ต้องลบทิ้งที่นี่
      this.logger.warn(
        `Rejecting upload ${key}: type=${contentType} size=${size} expected=${
          scope.mediaType ?? '-'
        }`,
      );
      await this.tosService.deleteObject(bucket, key);
      throw new ForbiddenException('Uploaded file type or size is not allowed');
    }

    const name = decodeName(body.name);
    const row = {
      uid,
      userId: scope.userId,
      index: Number(body.index) || 0,
      imageName: name,
      imagePath: key,
      imageType: contentType,
      imageSize: size,
      generateType: toUploadGenerateType(body.generateType),
      status: 'waiting',
    };
    if (scope.kind === 'ref') {
      const existing = await this.refImageRepository.findOne({
        where: { uid },
      });
      if (!isSameUpload(existing, uid, key)) {
        await this.refImageRepository.create({
          data: { ...row, projectId: scope.projectId! },
        });
      }
    } else {
      const existing = await this.promptGuideImageRepository.findOne({
        where: { uid },
      });
      if (!isSameUpload(existing, uid, key)) {
        await this.promptGuideImageRepository.create({
          data: { ...row, promptGuideId: Number(scope.promptGuideId) },
        });
      }
    }
    this.logger.log(
      `📥 [callback] ${scope.kind} ${uid} stored by browser → ${key}`,
    );
    return {
      uid,
      name,
      url: await this.storageUrl.toDisplayUrl(key),
      imagePath: key,
      status: 'waiting',
    };
  }

  private keyPrefix(
    scope: Pick<
      UploadScope,
      'kind' | 'organizationId' | 'projectId' | 'promptGuideId'
    >,
  ): string {
    if (scope.kind === 'ref') {
      if (!scope.projectId)
        throw new BadRequestException('projectId is required');
      return buildUploadKey(scope.organizationId, scope.projectId, '');
    }
    if (scope.kind === 'prompt-guide') {
      if (!scope.promptGuideId)
        throw new BadRequestException('promptGuideId is required');
      return buildPromptGuideKey(scope.organizationId, '');
    }
    throw new BadRequestException(`Unknown upload kind: ${String(scope.kind)}`);
  }

  private sign(encodedScope: string): string {
    // คีย์แยกจาก secret ของ TOS โดยตรง — token รั่วก็ไม่ได้ secret
    const key = createHmac('sha256', process.env.TOS_SECRET_KEY!)
      .update('upload-callback')
      .digest();
    return createHmac('sha256', key).update(encodedScope).digest('hex');
  }

  private verifyScope(encodedScope?: string, token?: string): UploadScope {
    if (!encodedScope || !token)
      throw new ForbiddenException('Missing callback token');
    const expected = Buffer.from(this.sign(encodedScope));
    const actual = Buffer.from(token);
    if (
      expected.length !== actual.length ||
      !timingSafeEqual(expected, actual)
    ) {
      throw new ForbiddenException('Invalid callback token');
    }
    let scope: UploadScope;
    try {
      scope = JSON.parse(
        Buffer.from(encodedScope, 'base64url').toString(),
      ) as UploadScope;
    } catch {
      throw new ForbiddenException('Malformed callback scope');
    }
    if (Date.now() > scope.expiresAt + CALLBACK_GRACE_MS) {
      throw new ForbiddenException('Upload policy expired');
    }
    return scope;
  }
}

/**
 * TOS อาจเรียก callback ซ้ำ — uid เดิม + key เดิมถือว่าสำเร็จแล้ว (ไม่สร้างซ้ำ)
 * @throws ConflictException เมื่อ uid นี้ผูกกับไฟล์อื่นอยู่แล้ว
 */
function isSameUpload(
  existing: { imagePath: string } | null,
  uid: string,
  key: string,
): boolean {
  if (!existing) return false;
  if (existing.imagePath === key) return true;
  throw new ConflictException(`uid ${uid} already belongs to another file`);
}

/** browser ส่งชื่อไฟล์แบบ encodeURIComponent เพื่อไม่ให้อักขระพิเศษทำ JSON ของ callback พัง */
function decodeName(name: string | undefined): string {
  if (!name) return 'upload';
  try {
    return decodeURIComponent(name);
  } catch {
    return name;
  }
}
