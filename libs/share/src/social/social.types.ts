import { SocialPlatform } from './social.constants';

/**
 * สื่อ 1 ชิ้นที่ถูก snapshot ไว้ใน activity_share.media_items
 *
 * เก็บเป็น object key ของ TOS ไม่ใช่ URL — presigned URL หมดอายุ
 * (กติกาเดียวกับทั้งระบบ ดู libs/share/src/storage/storage-url.service.ts)
 */
export interface ShareMediaItem {
  /** id ของแถว gallery ต้นทาง — เก็บไว้อ้างอิง แต่ไม่ join เพราะ gallery ถูกลบได้ */
  readonly galleryId: string;
  /** object key ของไฟล์ผลลัพธ์ */
  readonly resultKey: string;
  /** object key ของ thumbnail (ถ้ามี) */
  readonly thumbnailKey: string | null;
  readonly typeGenerate: string;
  /** ลำดับการแสดงผลในโพสต์ */
  readonly order: number;
}

/** สื่อที่ resolve เป็น URL/ชนิดไฟล์พร้อมส่งให้ provider แล้ว */
export interface ResolvedMedia {
  readonly url: string;
  readonly key: string;
  readonly isVideo: boolean;
  readonly mimeType: string;
}

/** ข้อมูลบัญชีที่ publisher ต้องใช้ — token ถอดรหัสแล้ว */
export interface PublisherAccount {
  readonly id: string;
  readonly platform: SocialPlatform;
  readonly externalId: string;
  readonly displayName: string;
  readonly accessToken: string;
}

export interface PublishInput {
  readonly account: PublisherAccount;
  readonly caption: string;
  readonly hashtags: readonly string[];
  readonly linkUrl: string | null;
  readonly media: readonly ResolvedMedia[];
}

export interface PublishResult {
  readonly remotePostId: string;
  readonly remoteUrl: string | null;
}

/**
 * error ที่ publisher โยนออกมา
 *
 * `retryable` เป็นตัวตัดสินว่า BullMQ ควร retry หรือไม่ — rate limit / 5xx = retry ได้,
 * caption ผิดกติกา หรือ codec ไม่รองรับ = ไม่ต้องเสีย attempt เพิ่ม
 */
export class PublishError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly retryable: boolean,
    readonly providerPayload?: unknown,
  ) {
    super(message);
    this.name = 'PublishError';
  }
}

/** สัญญากลางของตัวเผยแพร่แต่ละ platform */
export interface SocialPublisher {
  readonly platform: SocialPlatform;
  /**
   * เผยแพร่โพสต์ไป platform ปลายทาง
   *
   * @param input บัญชี + เนื้อหา + สื่อที่ resolve เป็น URL แล้ว
   * @returns id/url ของโพสต์ฝั่ง provider
   * @throws PublishError เมื่อ provider ปฏิเสธหรือเรียกไม่สำเร็จ
   */
  publish(input: PublishInput): Promise<PublishResult>;
}
