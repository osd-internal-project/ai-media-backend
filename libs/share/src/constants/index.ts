export * from './generation-type';

export class CreateGenerateDto {
  taskId?: string;
  type: 'image' | 'video';
  text: string;
  resolution: string;
  duration: number;
  image?: any;
  ratio: string;
  images: number;
  images_select: number;
  width: number;
  height: number;
  projectId: string;
  userId: string;
  modelName?: string; // Add optional model name
  generateAudio?: boolean;
  generateConfig?: any;
  organizationId?: string;
}

export const QUEUE_NAME_IMAGE = 'image-generate-queue';
export const QUEUE_NAME_VDO = 'vdo-generate-queue';
export const QUEUE_NAME_OMNIHUMEN = 'omnihumen-generate-queue';
export const QUEUE_NAME_DREAMACTOR = 'dreamactor-generate-queue';

export const MAX_CONCURRENT_TASKS_PER_TYPE = 10;

/** ชื่อ job ใน QUEUE_NAME_VDO นอกจากงาน submit (ชื่อเดียวกับคิว) */
export const VIDEO_JOB_FINALIZE = 'video-finalize';
export const VIDEO_JOB_POLL_CHECK = 'video-poll-check';
export const VIDEO_JOB_SWEEP = 'video-sweep';

/** ชื่อ job ใน QUEUE_NAME_IMAGE ที่ใช้กวาด gallery PENDING ค้าง (งาน generate ใช้ชื่อ 'image') */
export const IMAGE_JOB_SWEEP = 'image-sweep';

/** job state ที่ BullMQ ยังจะประมวลผลต่อ — sweeper ต้องไม่ยุ่ง */
export const LIVE_JOB_STATES: readonly string[] = [
  'waiting',
  'active',
  'delayed',
  'prioritized',
  'waiting-children',
];

/**
 * งาน video ที่เข้าคิวแล้วแต่ยังไม่ปิด — core เพิ่มตอนเข้าคิว, worker ลบตอนจบ/fail
 * sweeper ใช้หางานที่ไม่มีใครปิด (worker ไม่หยิบ / stalled / poll-check ขาด)
 * ZSET score = เวลาเข้าคิว (ms) · HASH เก็บข้อมูลที่ fail path ต้องใช้
 */
export const VIDEO_INFLIGHT_KEY = 'video:inflight';
export const VIDEO_INFLIGHT_DATA_KEY = 'video:inflight:data';

export interface VideoInflightData {
  clientId: string;
  userId: string;
  organizationId: string;
  projectId: string;
}

/** สถานะของ BytePlus Ark task ที่จบแล้ว — ไม่เปลี่ยนอีก */
export const BYTEPLUS_TERMINAL_STATUSES = [
  'succeeded',
  'failed',
  'expired',
  'cancelled',
] as const;
