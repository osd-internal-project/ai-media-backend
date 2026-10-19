export const MEDIA_TYPES = ['image', 'video', 'audio'] as const;
export type UploadMediaType = (typeof MEDIA_TYPES)[number];

/** แท็บที่อัปโหลด reference — เก็บลง ref_image.generate_type */
export const UPLOAD_GENERATE_TYPES = ['image', 'video', 'audio'] as const;
export type UploadGenerateType = (typeof UPLOAD_GENERATE_TYPES)[number];

/** ค่าที่ไม่รู้จักตกเป็น 'image' เหมือนพฤติกรรมเดิม */
export function toUploadGenerateType(value: unknown): UploadGenerateType {
  return UPLOAD_GENERATE_TYPES.find((type) => type === value) ?? 'image';
}

const MB = 1024 * 1024;

/** ขนาดสูงสุดต่อชนิด — รูปไม่ต้องใหญ่เท่าวิดีโอ (เดิม 500MB ทุกชนิด) */
export const MAX_BYTES_BY_MEDIA: Record<UploadMediaType, number> = {
  image: 20 * MB,
  audio: 50 * MB,
  video: 500 * MB,
};

/**
 * MIME ที่รับ → นามสกุลที่ยอมให้คู่กัน — เช็คแค่ prefix `image/` เดิมปล่อย `image/svg+xml` (มี script) ผ่าน
 */
const EXTENSIONS_BY_MIME: Record<string, readonly string[]> = {
  'image/jpeg': ['.jpg', '.jpeg', '.jfif'],
  'image/png': ['.png'],
  'image/webp': ['.webp'],
  'image/gif': ['.gif'],
  'video/mp4': ['.mp4', '.m4v'],
  'video/quicktime': ['.mov', '.qt'],
  'video/webm': ['.webm'],
  'audio/mpeg': ['.mp3', '.mpga'],
  'audio/wav': ['.wav'],
  'audio/x-wav': ['.wav'],
  'audio/mp4': ['.m4a', '.mp4'],
  // Chrome/Safari บน macOS ส่ง .m4a เป็น audio/x-m4a
  'audio/x-m4a': ['.m4a'],
  'audio/aac': ['.aac'],
  'audio/ogg': ['.ogg', '.oga'],
};

/** `image/JPEG; charset=…` → `image/jpeg` */
function normalizeMime(contentType: string | undefined): string {
  return (contentType ?? '').split(';')[0].trim().toLowerCase();
}

/** @returns ชนิดสื่อของ MIME ที่อยู่ใน whitelist หรือ null ถ้าไม่รับ */
export function mediaTypeOfMime(
  contentType: string | undefined,
): UploadMediaType | null {
  const mime = normalizeMime(contentType);
  if (!EXTENSIONS_BY_MIME[mime]) return null;
  return MEDIA_TYPES.find((type) => mime.startsWith(`${type}/`)) ?? null;
}

/** ชนิดอยู่ใน whitelist และขนาด 1..max ของชนิดนั้น */
export function isAllowedUpload(
  contentType: string | undefined,
  size: number,
): boolean {
  const mediaType = mediaTypeOfMime(contentType);
  return !!mediaType && size > 0 && size <= MAX_BYTES_BY_MEDIA[mediaType];
}

/** ไม่มีนามสกุล (เช่น blob) ยอมได้ — ถ้ามีต้องตรงกับ MIME กัน `x.html` ที่ประกาศเป็น image/png */
export function isExtensionAllowed(
  contentType: string | undefined,
  extension: string,
): boolean {
  if (!extension) return true;
  const allowed = EXTENSIONS_BY_MIME[normalizeMime(contentType)] ?? [];
  return allowed.includes(extension.toLowerCase());
}
