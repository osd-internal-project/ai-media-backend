import { createHash, randomBytes } from 'crypto';

/** ความยาวของส่วนสุ่มท้าย slug */
const SUFFIX_LENGTH = 8;

/** ตัวอักษรที่ใช้ในส่วนสุ่ม — ตัด i l o 0 1 ออกเพราะอ่านสับสนเวลาพิมพ์ตาม */
const SUFFIX_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

/** ความยาวสูงสุดของส่วนที่มาจาก title (เหลือที่ให้ suffix ใน VarChar(180)) */
const TITLE_SLUG_MAX = 120;

/** combining diacritical marks ที่เหลือหลัง normalize('NFKD') */
const COMBINING_MARKS = /[̀-ͯ]/g;

/**
 * แปลงข้อความเป็นส่วน slug ที่ปลอดภัยกับ URL
 *
 * รองรับภาษาไทยด้วยการตัดทิ้ง แล้วปล่อยให้ suffix สุ่มเป็นตัวระบุแทน — ไม่ทับศัพท์
 * เพราะการ transliterate ผิดจะได้ URL ที่อ่านแล้วเข้าใจผิดยิ่งกว่าไม่มีคำเลย
 *
 * @param text ข้อความต้นทาง (ปกติคือ title ของโพสต์)
 * @returns ส่วน slug ที่เป็น a-z 0-9 และ - เท่านั้น (อาจเป็นค่าว่าง)
 */
export function slugifyTitle(text: string): string {
  return (text ?? '')
    .toLowerCase()
    .normalize('NFKD')
    // ตัด diacritic ทิ้งเพื่อให้ é กลายเป็น e ไม่ใช่ "e-"
    .replace(COMBINING_MARKS, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, TITLE_SLUG_MAX)
    .replace(/-+$/g, '');
}

/**
 * สร้างส่วนสุ่มท้าย slug ด้วย CSPRNG
 *
 * ใช้ randomBytes ไม่ใช่ Math.random เพราะ suffix นี้ทำหน้าที่กันการเดา URL
 * ไล่ทีละใบด้วย ไม่ใช่แค่กันชื่อชนกัน
 *
 * @returns สตริงสุ่มความยาว SUFFIX_LENGTH
 */
export function randomSlugSuffix(): string {
  const bytes = randomBytes(SUFFIX_LENGTH);
  let out = '';
  for (let i = 0; i < SUFFIX_LENGTH; i += 1) {
    out += SUFFIX_ALPHABET[bytes[i] % SUFFIX_ALPHABET.length];
  }
  return out;
}

/**
 * ประกอบ slug สาธารณะของโพสต์
 *
 * @param title title ของโพสต์ (ว่างได้)
 * @returns slug เช่น `summer-launch-k7m2p9qx` หรือ `k7m2p9qx` เมื่อ title ไม่เหลือตัวอักษรละติน
 */
export function buildCommunitySlug(title: string): string {
  const base = slugifyTitle(title);
  const suffix = randomSlugSuffix();
  return base ? `${base}-${suffix}` : suffix;
}

/**
 * แปลง visitor id จาก cookie เป็นค่าที่เก็บลง DB ได้
 *
 * เก็บเฉพาะ hash ไม่เก็บค่าดิบ — ตาราง reaction ต้องการแค่ "คนนี้เคยกดหรือยัง"
 * ไม่ต้องการความสามารถในการย้อนกลับไปหาตัวผู้เยี่ยมชม
 *
 * @param visitorId ค่าดิบจาก cookie ของผู้เยี่ยมชม
 * @returns hex digest ความยาว 64 ตัว
 */
export function hashVisitorId(visitorId: string): string {
  return createHash('sha256').update(visitorId).digest('hex');
}
