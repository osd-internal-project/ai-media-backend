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

/** สถานะของ BytePlus Ark task ที่จบแล้ว — ไม่เปลี่ยนอีก */
export const BYTEPLUS_TERMINAL_STATUSES = [
  'succeeded',
  'failed',
  'expired',
  'cancelled',
] as const;
