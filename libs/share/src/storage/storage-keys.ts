/**
 * Canonical object-key layout for TOS storage.
 *
 * ทุก path ใน object storage ต้องสร้างจากไฟล์นี้ที่เดียว — ห้ามเขียน template
 * `organize/${org}/...` ซ้ำในแต่ละ service อีก เพราะเป็นต้นเหตุของบั๊ก
 * reference image ที่กลับมาซ้ำ ๆ (เช่น `upload` vs `uploads`, prefix ซ้อน)
 *
 * ฟังก์ชันในไฟล์นี้เป็น pure ทั้งหมด (ไม่พึ่ง Nest / TOS SDK) เพื่อให้ import
 * ได้จากทุก service และเขียน unit test ได้ตรง ๆ
 */

/** โฟลเดอร์ที่เก็บไฟล์อัปโหลดจากผู้ใช้ — เอกพจน์ ตรงกับที่ upload service เขียนจริง */
export const UPLOAD_DIR = 'upload' as const;

/** รากของ path ทุกอย่างใน bucket */
const ROOT_DIR = 'organize' as const;

/** ค่าที่ใช้แทนรูปเมื่อ resolve reference ไม่สำเร็จ (ใช้ร่วมกันทุก read path) */
export const REF_IMAGE_PLACEHOLDER =
  'data:image/svg+xml;base64,' +
  Buffer.from(
    `<svg width="32" height="32" xmlns="http://www.w3.org/2000/svg">
    <rect width="32" height="32" fill="#333"/>
    <text x="16" y="18" text-anchor="middle" font-family="Arial" font-size="8" fill="#666">No Image</text>
  </svg>`,
  ).toString('base64');

/**
 * ตรวจว่าค่าเป็น URL ที่ fetch ได้อยู่แล้วหรือไม่
 *
 * ใช้เป็น guard ก่อน presign เสมอ — reference ที่มาจาก workflow/frontend
 * อาจเป็นลิงก์เต็มอยู่แล้ว การ presign ซ้ำจะได้ URL ที่ใช้ไม่ได้
 *
 * @param value ค่าที่จะตรวจ (object key หรือ URL)
 * @returns true เมื่อขึ้นต้นด้วย http:// หรือ https://
 */
export function isAbsoluteUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

/**
 * ตรวจว่าค่าเป็น object key ของ bucket นี้หรือไม่
 *
 * @param value ค่าที่จะตรวจ
 * @returns true เมื่อขึ้นต้นด้วย `organize/`
 */
export function isStorageKey(value: string): boolean {
  return value.startsWith(`${ROOT_DIR}/`);
}

/**
 * สร้าง key ของไฟล์ที่ผู้ใช้อัปโหลด
 *
 * @param organizationId รหัสองค์กร
 * @param projectId รหัสโปรเจกต์
 * @param uid ชื่อไฟล์ฝั่ง client (antd rc-upload uid)
 * @param ext นามสกุลไฟล์ รวมจุด เช่น `.png` (ส่ง '' ได้ถ้าไม่มี)
 * @returns organize/{org}/{projectId}/upload/{uid}{ext}
 */
export function buildUploadKey(
  organizationId: string,
  projectId: string,
  uid: string,
  ext = '',
): string {
  return `${ROOT_DIR}/${organizationId}/${projectId}/${UPLOAD_DIR}/${uid}${ext}`;
}

/**
 * สร้าง key ของรูปประกอบ prompt guide (ระดับองค์กร ไม่ผูกกับโปรเจกต์)
 *
 * @param organizationId รหัสองค์กร
 * @param uid ชื่อไฟล์ฝั่ง client
 * @param ext นามสกุลไฟล์ รวมจุด เช่น `.png`
 * @returns organize/{org}/prompt-guide/{uid}{ext}
 */
export function buildPromptGuideKey(
  organizationId: string,
  uid: string,
  ext = '',
): string {
  return `${ROOT_DIR}/${organizationId}/prompt-guide/${uid}${ext}`;
}

/**
 * สร้าง key ของไฟล์ผลลัพธ์ที่ generate ออกมา
 *
 * @param organizationId รหัสองค์กร
 * @param projectId รหัสโปรเจกต์
 * @param typeGenerate ชนิดการ generate เช่น `image` | `video` — ประกอบเป็น `{type}-generate`
 * @param objectName ชื่อไฟล์ใน bucket
 * @returns organize/{org}/{projectId}/{typeGenerate}-generate/{objectName}
 */
export function buildOutputKey(
  organizationId: string,
  projectId: string,
  typeGenerate: string,
  objectName: string,
): string {
  return `${ROOT_DIR}/${organizationId}/${projectId}/${typeGenerate}-generate/${objectName}`;
}
