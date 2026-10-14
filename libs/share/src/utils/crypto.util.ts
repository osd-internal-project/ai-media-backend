import * as crypto from 'crypto';

/**
 * เข้ารหัส/ถอดรหัส secret ที่ต้องเก็บลง DB (OAuth access/refresh token ของ social account)
 *
 * รูปแบบ ciphertext: "v1:<iv-base64>:<authTag-base64>:<ciphertext-base64>"
 * มี prefix เวอร์ชันไว้เผื่อเปลี่ยน algorithm ในอนาคตโดยไม่ต้อง migrate ข้อมูลเก่า
 */

const ALGORITHM = 'aes-256-gcm';
const VERSION = 'v1';
const IV_LENGTH = 12; // GCM แนะนำ 96-bit IV
const KEY_LENGTH = 32; // AES-256
const ENV_KEY = 'SOCIAL_TOKEN_ENC_KEY';

/**
 * อ่าน key จาก env แล้วตรวจความยาว
 *
 * จงใจ throw แทนที่จะ fallback เป็น plaintext — ถ้า key หาย ต้องพังให้เห็น
 * ไม่ใช่แอบเก็บ token แบบอ่านออกลง DB เงียบ ๆ
 *
 * @returns key ขนาด 32 byte
 * @throws Error เมื่อ env ไม่ได้ตั้ง หรือความยาวไม่ใช่ 32 byte
 */
function getKey(): Buffer {
  const raw = process.env[ENV_KEY];
  if (!raw) {
    throw new Error(
      `${ENV_KEY} is not set — cannot encrypt social account tokens`,
    );
  }
  const key = Buffer.from(raw, 'hex');
  if (key.length !== KEY_LENGTH) {
    throw new Error(
      `${ENV_KEY} must be ${KEY_LENGTH} bytes hex-encoded (${KEY_LENGTH * 2} hex chars), got ${key.length} bytes`,
    );
  }
  return key;
}

/**
 * ตรวจว่า env key ถูกตั้งและใช้งานได้ — เรียกตอน bootstrap เพื่อให้พังตั้งแต่ start
 *
 * @throws Error เมื่อ key ไม่พร้อมใช้งาน
 */
export function assertEncryptionKeyReady(): void {
  getKey();
}

/**
 * เข้ารหัสข้อความ
 *
 * @param plaintext ข้อความต้นฉบับ (เช่น access token)
 * @returns ciphertext รูปแบบ "v1:iv:tag:data"
 */
export function encryptSecret(plaintext: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return [
    VERSION,
    iv.toString('base64'),
    authTag.toString('base64'),
    encrypted.toString('base64'),
  ].join(':');
}

/**
 * ถอดรหัสข้อความที่เข้ารหัสด้วย encryptSecret
 *
 * @param payload ciphertext รูปแบบ "v1:iv:tag:data"
 * @returns ข้อความต้นฉบับ
 * @throws Error เมื่อรูปแบบผิด เวอร์ชันไม่รู้จัก หรือ auth tag ไม่ตรง (ข้อมูลถูกแก้)
 */
export function decryptSecret(payload: string): string {
  const parts = payload.split(':');
  if (parts.length !== 4) {
    throw new Error('Malformed encrypted payload');
  }
  const [version, ivB64, tagB64, dataB64] = parts;
  if (version !== VERSION) {
    throw new Error(`Unsupported encryption version "${version}"`);
  }
  const key = getKey();
  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    key,
    Buffer.from(ivB64, 'base64'),
  );
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}
