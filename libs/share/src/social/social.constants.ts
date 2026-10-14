/**
 * ค่าคงที่กลางของฟีเจอร์ Public Social
 * ใช้ร่วมกันระหว่าง core (สร้าง/อนุมัติงาน) และ worker-service (ยิงขึ้น platform)
 */

export const SOCIAL_PLATFORMS = [
  'FACEBOOK',
  'INSTAGRAM',
  'TIKTOK',
  'YOUTUBE',
] as const;
export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];

export const SOCIAL_ACCOUNT_STATUSES = ['ACTIVE', 'EXPIRED', 'REVOKED'] as const;
export type SocialAccountStatus = (typeof SOCIAL_ACCOUNT_STATUSES)[number];

/**
 * ที่มาของ token ในบัญชี
 * OAUTH  = ผู้ใช้กด consent เอง (ต่ออายุอัตโนมัติได้ถ้ามี refresh token)
 * MANUAL = แอดมินระบบวาง token ให้ (ใช้ตอนยังไม่ผ่าน app review ของ provider)
 */
export const SOCIAL_CONNECTION_TYPES = ['OAUTH', 'MANUAL'] as const;
export type SocialConnectionType = (typeof SOCIAL_CONNECTION_TYPES)[number];

export const ACTIVITY_SHARE_STATUSES = [
  'NEW',
  'APPROVED',
  'REJECTED',
  'PENDING',
  'PUBLISHING',
  'SUCCESS',
  'FAILED',
] as const;
export type ActivityShareStatus = (typeof ACTIVITY_SHARE_STATUSES)[number];

export const SHARE_TARGET_STATUSES = [
  'PENDING',
  'PUBLISHING',
  'SUCCESS',
  'FAILED',
] as const;
export type ShareTargetStatus = (typeof SHARE_TARGET_STATUSES)[number];

export const ACTIVITY_SHARE_ACTIONS = [
  'CREATE',
  'UPDATE',
  'SUBMIT',
  'APPROVE',
  'REJECT',
  'SEND',
  'PUBLISH_START',
  'PUBLISH_SUCCESS',
  'PUBLISH_FAIL',
  'RETRY',
  'CANCEL',
] as const;
export type ActivityShareAction = (typeof ACTIVITY_SHARE_ACTIONS)[number];

/**
 * State machine ของงาน share — การเปลี่ยนสถานะทุกครั้งต้องผ่านตารางนี้
 * ถ้าไม่อยู่ในนี้ = ไม่อนุญาต (ไม่มี fallback)
 */
export const ALLOWED_TRANSITIONS: Readonly<
  Record<ActivityShareStatus, readonly ActivityShareStatus[]>
> = {
  NEW: ['APPROVED', 'REJECTED'],
  // reject แล้วแก้ไขใหม่ได้ กลับมาเป็น NEW เพื่อรออนุมัติอีกรอบ
  REJECTED: ['NEW'],
  APPROVED: ['PENDING'],
  PENDING: ['PUBLISHING'],
  PUBLISHING: ['SUCCESS', 'FAILED'],
  // retry งานที่ล้มเหลว
  FAILED: ['PENDING'],
  // สถานะปลายทาง
  SUCCESS: [],
} as const;

/** สถานะที่ยังแก้ไข/ลบงานได้ */
export const EDITABLE_STATUSES: readonly ActivityShareStatus[] = [
  'NEW',
  'REJECTED',
] as const;

/** typeGenerate ใน gallery ที่นับเป็นวิดีโอ (ที่เหลือถือเป็นรูป) */
export const VIDEO_GENERATE_TYPES: readonly string[] = [
  'video',
  'dreamactor',
  'omnihumen',
  'omnihuman',
] as const;

/**
 * ข้อจำกัดของแต่ละ platform ที่ใช้ validate ก่อนสร้างงาน
 * ตัวเลขอ้างอิงจากเอกสาร provider ณ ตอนพัฒนา — อาจต้องอัปเดตเมื่อ provider เปลี่ยน
 */
export interface PlatformCapability {
  readonly allowsImage: boolean;
  readonly allowsVideo: boolean;
  /** จำนวนสื่อสูงสุดต่อ 1 โพสต์ */
  readonly maxMediaCount: number;
  /** ความยาว caption สูงสุด (ตัวอักษร) */
  readonly maxCaptionLength: number;
  /** ผสมรูปกับวิดีโอในโพสต์เดียวได้หรือไม่ */
  readonly allowsMixedMedia: boolean;
}

export const PLATFORM_CAPABILITIES: Readonly<
  Record<SocialPlatform, PlatformCapability>
> = {
  FACEBOOK: {
    allowsImage: true,
    allowsVideo: true,
    maxMediaCount: 10,
    maxCaptionLength: 5000,
    allowsMixedMedia: false,
  },
  INSTAGRAM: {
    allowsImage: true,
    allowsVideo: true,
    maxMediaCount: 10,
    maxCaptionLength: 2200,
    allowsMixedMedia: true,
  },
  TIKTOK: {
    allowsImage: false,
    allowsVideo: true,
    maxMediaCount: 1,
    maxCaptionLength: 2200,
    allowsMixedMedia: false,
  },
  YOUTUBE: {
    allowsImage: false,
    allowsVideo: true,
    maxMediaCount: 1,
    maxCaptionLength: 5000,
    allowsMixedMedia: false,
  },
} as const;

/** จำนวนสื่อสูงสุดต่องาน share (เพดานรวม ก่อนตรวจรายbplatform) */
export const MAX_MEDIA_PER_SHARE = 10;

/** ชื่อคิว BullMQ สำหรับงานเผยแพร่ */
export const QUEUE_NAME_SOCIAL_PUBLISH = 'social-publish-queue';

/** จำนวนงานเผยแพร่ที่ประมวลผลพร้อมกัน — ต่ำกว่างาน generate เพราะติด rate limit ของ provider */
export const MAX_CONCURRENT_SOCIAL_PUBLISH = 3;

/** payload ของ job ในคิว */
export interface SocialPublishJobData {
  readonly activityShareId: string;
  /** จำกัดเฉพาะ target ที่ระบุ (ใช้ตอน retry) — ว่าง = ทำทุก target ที่ยัง PENDING */
  readonly targetIds?: string[];
}
