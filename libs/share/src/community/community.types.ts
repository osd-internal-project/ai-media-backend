/**
 * สื่อ 1 ชิ้นที่ถูก snapshot ไว้ใน community_post.media_items
 *
 * รูปแบบเดียวกับ ShareMediaItem ของ Public Social โดยตั้งใจ — สื่อมาจาก gallery
 * ชุดเดียวกัน และเก็บเป็น object key ของ TOS ไม่ใช่ URL เพราะ presigned URL หมดอายุ
 * (กติกาเดียวกับทั้งระบบ ดู libs/share/src/storage/storage-url.service.ts)
 *
 * ประกาศแยกจาก ShareMediaItem ไม่ใช้ตัวเดียวกัน เพราะสองฟีเจอร์นี้ต้องวิวัฒน์แยกกันได้
 * โดยไม่ทำให้อีกฝั่งพัง
 */
export interface CommunityMediaItem {
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

/**
 * สื่อ 1 ชิ้นในรูปแบบที่ปลอดภัยต่อการส่งออกหน้า public
 *
 * ไม่มี galleryId และไม่มี object key — ผู้เยี่ยมชมได้แค่ index ไว้ประกอบ URL
 * ของ endpoint redirect ที่ presign ให้สด ๆ ทุกครั้ง
 */
export interface PublicCommunityMedia {
  readonly index: number;
  readonly isVideo: boolean;
  /** URL ที่ redirect ไป presigned URL ใหม่ทุกครั้ง — คงที่พอให้ crawler cache ได้ */
  readonly url: string;
  readonly thumbnailUrl: string;
}

/**
 * payload ของโพสต์ที่ส่งออกหน้า public
 *
 * นี่คือสัญญาเดียวที่ผู้เยี่ยมชมเห็น — field ที่ไม่อยู่ในนี้ต้องไม่หลุดออกไป
 * โดยเฉพาะ organizationId, projectId, createdByUserId, galleryId และชื่อโมเดล AI
 */
export interface PublicCommunityPost {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly caption: string;
  readonly hashtags: readonly string[];
  readonly linkUrl: string | null;
  readonly media: readonly PublicCommunityMedia[];
  /** มีค่าเฉพาะเมื่อเจ้าของโพสต์เลือกเปิดเผย prompt เอง */
  readonly prompt: string | null;
  readonly authorDisplayName: string;
  readonly organizationDisplayName: string;
  readonly publishedAt: Date | null;
  readonly viewCount: number;
  readonly likeCount: number;
}
