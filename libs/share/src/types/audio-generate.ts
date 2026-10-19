/** pcm ตัดออก — browser เล่นไม่ได้ */
export const AUDIO_FORMATS = ['mp3', 'wav', 'ogg_opus'] as const;
export type AudioFormat = (typeof AUDIO_FORMATS)[number];

export const AUDIO_MAX_PROMPT_LENGTH = 3000;
export const AUDIO_MAX_REFERENCES = 3;

/** ช่องอ้างอิงที่ N ตรงกับ `@AudioN` ใน prompt — ใส่ได้อย่างใดอย่างหนึ่ง */
export interface AudioReference {
  /** object key ของ TOS (จากการอัปโหลด) หรือ URL http(s) */
  url?: string;
  /** voice / speaker id ของ provider */
  speaker?: string;
}

export class RequestAudioGenerateDto {
  taskId: string;
  model: string;
  prompt: string;
  projectId: string;
  userId: string;
  organizationId?: string;
  typeGenerate: string;
  references?: AudioReference[];
  // ใช้ชื่อ `image` เหมือน type อื่น ให้ collectReferenceKeys เก็บ reference ลง gallery ได้เลย
  image?: string[];
  format: AudioFormat;
  sampleRate?: number;
  speechRate?: number;
  loudnessRate?: number;
  pitchRate?: number;
  enableSubtitle?: boolean;
}

const isHttpUrl = (value: string) => /^https?:\/\//i.test(value);
// object key ของ TOS ไม่มี scheme — มี scheme แล้วต้องเป็น http(s) เท่านั้น
const isAllowedSource = (value: string) =>
  !/^[a-z][a-z0-9+.-]*:/i.test(value) || isHttpUrl(value);
const isOptionalNumber = (value: unknown) =>
  value === undefined || value === null || Number.isFinite(value);

/**
 * ตรวจ payload จาก socket (ไม่มี ValidationPipe) — คืนข้อความ error หรือ null ถ้าผ่าน
 */
export function validateAudioRequest(
  body: Partial<RequestAudioGenerateDto>,
): string | null {
  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
  if (!prompt) return 'prompt is required';
  if (prompt.length > AUDIO_MAX_PROMPT_LENGTH)
    return `prompt must be at most ${AUDIO_MAX_PROMPT_LENGTH} characters`;

  if (!AUDIO_FORMATS.includes(body.format as AudioFormat))
    return `format must be one of ${AUDIO_FORMATS.join(', ')}`;

  const references = body.references ?? [];
  if (!Array.isArray(references)) return 'references must be an array';
  if (references.length > AUDIO_MAX_REFERENCES)
    return `at most ${AUDIO_MAX_REFERENCES} audio references`;
  for (const [index, ref] of references.entries()) {
    const url = typeof ref?.url === 'string' ? ref.url.trim() : '';
    const speaker = typeof ref?.speaker === 'string' ? ref.speaker.trim() : '';
    if (Boolean(url) === Boolean(speaker))
      return `reference ${index + 1} needs exactly one of url or speaker`;
    if (url && !isAllowedSource(url))
      return `reference ${index + 1} url must be http(s)`;
  }

  const images = (body.image ?? []).filter(Boolean);
  if (images.length > 1) return 'at most 1 reference image';
  if (images.length && references.length)
    return 'use either audio references or a reference image, not both';
  if (images.some((image) => !isAllowedSource(image)))
    return 'reference image url must be http(s)';

  if (
    body.sampleRate !== undefined &&
    body.sampleRate !== null &&
    !(Number.isInteger(body.sampleRate) && body.sampleRate > 0)
  )
    return 'sampleRate must be a positive integer';
  if (
    ![body.speechRate, body.loudnessRate, body.pitchRate].every(
      isOptionalNumber,
    )
  )
    return 'speechRate, loudnessRate and pitchRate must be numbers';

  return null;
}
