import { PublishError } from '@ai-media/share';

/**
 * HTTP status ที่ถือว่าลองใหม่แล้วมีโอกาสสำเร็จ
 * 429 = โดน rate limit, 5xx = ฝั่ง provider มีปัญหาชั่วคราว
 */
function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

/**
 * เรียก API ของ provider แล้วแปลง error ให้เป็น PublishError
 *
 * รวมไว้ที่เดียวเพื่อให้ทุก publisher ตัดสินใจเรื่อง retryable แบบเดียวกัน —
 * ไม่งั้นแต่ละเจ้าจะ retry คนละแบบและ debug ยาก
 *
 * @param label ชื่อขั้นตอนที่จะขึ้นในข้อความ error เช่น "facebook.photos"
 * @param url ปลายทาง
 * @param init options ของ fetch
 * @returns body ที่ parse เป็น JSON แล้ว
 * @throws PublishError เมื่อ provider ตอบไม่ใช่ 2xx หรือ parse JSON ไม่ได้
 */
export async function requestJson<T>(
  label: string,
  url: string,
  init?: RequestInit,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch (error) {
    // network error — ลองใหม่ได้เสมอ
    throw new PublishError(
      `${label}.network`,
      `${label}: ${error instanceof Error ? error.message : String(error)}`,
      true,
    );
  }

  const text = await response.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }

  if (!response.ok) {
    throw new PublishError(
      `${label}.http_${response.status}`,
      `${label} failed (${response.status}): ${extractMessage(body) ?? text.slice(0, 500)}`,
      isRetryableStatus(response.status),
      body,
    );
  }

  return body as T;
}

/**
 * ดึงข้อความ error ที่อ่านรู้เรื่องออกจาก body ของ provider
 *
 * แต่ละเจ้าซ่อน message คนละที่ (Meta ใช้ error.message, TikTok ใช้ error.message
 * ใต้ data, Google ใช้ error.message เหมือนกัน) จึงลองไล่ทีละแบบ
 *
 * @param body body ที่ parse แล้ว
 * @returns ข้อความ หรือ null เมื่อหาไม่เจอ
 */
function extractMessage(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const error = (body as { error?: unknown }).error;
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object') {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string') return message;
  }
  return null;
}

/**
 * ดาวน์โหลดไฟล์สื่อจาก presigned URL มาเป็น Buffer
 *
 * ใช้เฉพาะ platform ที่ต้องอัปโหลดไฟล์จริง (TikTok, YouTube) — เจ้าที่ pull จาก URL
 * ได้เอง (Facebook, Instagram) ไม่ต้องผ่านตรงนี้ ประหยัดทั้ง memory และเวลา
 *
 * @param url presigned URL ของไฟล์
 * @returns เนื้อไฟล์และขนาด
 * @throws PublishError เมื่อดาวน์โหลดไม่สำเร็จ
 */
export async function downloadMedia(
  url: string,
): Promise<{ buffer: Buffer; size: number }> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new PublishError(
      'media.download',
      `Could not download the media file (${response.status})`,
      isRetryableStatus(response.status),
    );
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  return { buffer, size: buffer.byteLength };
}

/**
 * หน่วงเวลา — ใช้ตอน poll สถานะของ provider
 *
 * @param ms จำนวนมิลลิวินาที
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
