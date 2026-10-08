import * as crypto from 'crypto';

/**
 * ลายเซ็นของ callback_url ที่เราฝากไว้กับ BytePlus Ark (Seedance)
 *
 * Ark ไม่ได้ระบุว่าส่ง signature มากับ callback จึงฝัง HMAC ของ taskId ไว้ใน query เอง
 * ใครรู้ URL ก็ได้แค่ "ปลุก" ให้เรา GET สถานะจริงจาก provider — ไม่มีทางยัดผลปลอมเข้ามา
 */

const SECRET_ENV = 'BYTEPLUS_CALLBACK_SECRET';
const BASE_URL_ENV = 'BYTEPLUS_CALLBACK_BASE_URL';

/** path ใต้ global prefix ของ core — ต้องตรงกับ ByteplusWebhookController */
export const BYTEPLUS_VIDEO_CALLBACK_PATH = 'webhooks/byteplus/video';

function sign(taskId: string, secret: string | Buffer): string {
  return crypto.createHmac('sha256', secret).update(taskId).digest('hex');
}

/**
 * คีย์สำหรับ sig — ใช้ `BYTEPLUS_CALLBACK_SECRET` ถ้าตั้งไว้ ไม่งั้น derive จาก `TOS_SECRET_KEY`
 * ซึ่ง core กับ worker ได้ค่าเดียวกันจาก CI อยู่แล้ว → deploy แล้วใช้ได้โดยไม่ต้องเพิ่ม secret
 */
function callbackKey(): string | Buffer | null {
  const explicit = process.env[SECRET_ENV];
  if (explicit) return explicit;
  const tosSecret = process.env.TOS_SECRET_KEY;
  if (!tosSecret) return null;
  return crypto.createHmac('sha256', tosSecret).update('byteplus-callback').digest();
}

/**
 * สร้าง callback_url สำหรับงานวิดีโอหนึ่งงาน
 *
 * @param taskId taskId ของเรา (ไม่ใช่ id ของ provider)
 * @returns URL เต็ม หรือ null เมื่อยังไม่ได้ตั้ง env — ผู้เรียกต้องพึ่ง poll สำรองแทน
 */
export function buildByteplusVideoCallbackUrl(taskId: string): string | null {
  const secret = callbackKey();
  const baseUrl = process.env[BASE_URL_ENV];
  if (!secret || !baseUrl) return null;
  const base = baseUrl.replace(/\/+$/, '');
  return `${base}/${BYTEPLUS_VIDEO_CALLBACK_PATH}/${encodeURIComponent(
    taskId,
  )}?sig=${sign(taskId, secret)}`;
}

/**
 * ตรวจ sig ที่ติดมากับ callback แบบ constant-time
 *
 * @returns false เมื่อ secret ไม่ได้ตั้ง, sig ว่าง หรือไม่ตรง
 */
export function verifyByteplusCallbackSig(
  taskId: string,
  sig: string | undefined,
): boolean {
  const secret = callbackKey();
  if (!secret || !sig) return false;
  const expected = Buffer.from(sign(taskId, secret), 'utf8');
  const actual = Buffer.from(sig, 'utf8');
  return (
    expected.length === actual.length &&
    crypto.timingSafeEqual(expected, actual)
  );
}
