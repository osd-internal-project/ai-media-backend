/** model ที่ kiosk ใช้ generate — ต้องมีแถว active ใน master_model_type */
export const PHOTO_EVENT_MODEL = 'seedream-5-0-260128';

/** ขนาดคงที่ของรูปผลลัพธ์: preset 3:4 ที่ 2k เหมือนหน้า Gen Image */
export const PHOTO_EVENT_SIZE = {
  width: 1728,
  height: 2304,
  ratio: '3:4',
  resolution: '2k',
} as const;

/** ต่อท้าย textPrompt ของ template เมื่อ project ไม่ได้ตั้ง promptTail เอง */
export const PHOTO_EVENT_DEFAULT_PROMPT_TAIL =
  'Use the person in image 1 as the subject. Keep their face, identity, skin tone and body shape unchanged. ' +
  'Dress them in the outfit and style of the template reference image, matching its pose, lighting and background.';

/** room ของ socket คือ `${projectId}:photo-event` */
export const PHOTO_EVENT_ROOM_TYPE = 'photo-event';

export const PHOTO_EVENT_EVENTS = {
  photoCreated: 'photo-event.photo.created',
  photoDeleted: 'photo-event.photo.deleted',
  generationUpdated: 'photo-event.generation.updated',
} as const;

/** ค่าที่ประทับลง gallery/log.featureType ของงานจาก Photo Event */
export const PHOTO_EVENT_FEATURE_TYPE = 'photo-event';

export const PHOTO_EVENT_MAX_UPLOAD_FILES = 20;

/** ต้องเท่ากับ PHOTO_EVENT_MAX_FILE_BYTES ของ frontend */
export const PHOTO_EVENT_MAX_FILE_BYTES = 50 * 1024 * 1024;

/** ด้านยาวสุดของรูปที่เก็บ — รูปใหญ่กว่านี้ถูกย่อก่อนเก็บและก่อนส่งเข้า model */
export const PHOTO_EVENT_MAX_IMAGE_EDGE = 4096;

export const PHOTO_EVENT_THUMB_WIDTH = 480;

/** ต้องเท่ากับ PROMPT_MAX_LENGTH ของ frontend */
export const PHOTO_EVENT_PROMPT_MAX_LENGTH = 5000;

export type PhotoEventGenerationStatus =
  | 'pending'
  | 'processing'
  | 'success'
  | 'failed';
