/**
 * ค่าคงที่กลางของฟีเจอร์ Communication (หน้า community สาธารณะ)
 * ใช้ร่วมกันระหว่าง core (สร้าง/อนุมัติ/เผยแพร่) และ worker-service (cron เผยแพร่ตามเวลา)
 */

export const COMMUNITY_POST_STATUSES = [
  'NEW',
  'APPROVED',
  'REJECTED',
  'SCHEDULED',
  'PUBLISHED',
  'UNPUBLISHED',
] as const;
export type CommunityPostStatus = (typeof COMMUNITY_POST_STATUSES)[number];

export const COMMUNITY_POST_ACTIONS = [
  'CREATE',
  'UPDATE',
  'APPROVE',
  'REJECT',
  'SCHEDULE',
  'UNSCHEDULE',
  'PUBLISH',
  'UNPUBLISH',
  'REPUBLISH',
  'DELETE',
] as const;
export type CommunityPostAction = (typeof COMMUNITY_POST_ACTIONS)[number];

/**
 * State machine ของโพสต์ — การเปลี่ยนสถานะทุกครั้งต้องผ่านตารางนี้
 * ถ้าไม่อยู่ในนี้ = ไม่อนุญาต (ไม่มี fallback)
 */
export const COMMUNITY_ALLOWED_TRANSITIONS: Readonly<
  Record<CommunityPostStatus, readonly CommunityPostStatus[]>
> = {
  NEW: ['APPROVED', 'REJECTED'],
  // reject แล้วแก้ไขใหม่ได้ กลับมาเป็น NEW เพื่อรออนุมัติอีกรอบ
  REJECTED: ['NEW'],
  // อนุมัติแล้วเลือกได้ว่าจะเผยแพร่เลย หรือตั้งเวลาไว้
  APPROVED: ['PUBLISHED', 'SCHEDULED'],
  // cron เผยแพร่เมื่อถึงเวลา หรือผู้ใช้ยกเลิกตารางเวลากลับมาเป็น APPROVED
  SCHEDULED: ['PUBLISHED', 'APPROVED'],
  // ถอดโพสต์ออกจากหน้าสาธารณะ (takedown) — ไม่ลบทิ้งเพื่อให้ audit trail อยู่ครบ
  PUBLISHED: ['UNPUBLISHED'],
  UNPUBLISHED: ['PUBLISHED'],
} as const;

/** สถานะที่ยังแก้ไข/ลบโพสต์ได้ */
export const COMMUNITY_EDITABLE_STATUSES: readonly CommunityPostStatus[] = [
  'NEW',
  'REJECTED',
] as const;

/**
 * สถานะเดียวที่หน้า public มองเห็น
 *
 * ทุก query ในโมดูล public-community ต้องกรองด้วยค่านี้แบบตายตัว
 * และห้ามรับ status จาก query string ของผู้เยี่ยมชม
 */
export const COMMUNITY_PUBLIC_STATUS: CommunityPostStatus = 'PUBLISHED';

/** จำนวนสื่อสูงสุดต่อ 1 โพสต์ */
export const MAX_MEDIA_PER_COMMUNITY_POST = 10;

/** ความยาวสูงสุดของ caption */
export const MAX_COMMUNITY_CAPTION_LENGTH = 5000;

/** ความยาวสูงสุดของ title */
export const MAX_COMMUNITY_TITLE_LENGTH = 200;

/** จำนวนโพสต์ต่อหน้าของ feed สาธารณะเมื่อไม่ระบุ */
export const COMMUNITY_FEED_PAGE_SIZE = 24;

/** วิธีเรียงลำดับที่ feed สาธารณะรองรับ */
export const COMMUNITY_FEED_SORTS = ['latest', 'popular'] as const;
export type CommunityFeedSort = (typeof COMMUNITY_FEED_SORTS)[number];

/**
 * ช่วงเวลาที่ cron มองย้อนหลังเพื่อหาโพสต์ที่ถึงกำหนดเผยแพร่ (นาที)
 *
 * ไม่จำกัดขอบล่างไม่ได้ — ถ้า worker ดับไปหลายชั่วโมง โพสต์ที่เลยกำหนดมานาน
 * ไม่ควรโผล่ขึ้นมาพร้อมกันทีเดียวโดยไม่มีใครรู้ตัว เกินช่วงนี้ให้แอดมินกดเอง
 */
export const COMMUNITY_SCHEDULE_GRACE_MINUTES = 60;

/** จำนวนโพสต์ที่ cron หยิบมาทำต่อ 1 รอบ */
export const COMMUNITY_SCHEDULE_BATCH_SIZE = 50;
