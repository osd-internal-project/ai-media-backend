import sharp = require('sharp');
import { BadRequestException } from '@nestjs/common';

export const ANNOUNCEMENT_MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_EDGE = 1600;
const JPEG_QUALITY = 85;

/** โปสเตอร์ประกาศ — ย่อด้านยาวไม่เกิน 1600 เป็น JPEG (PNG ของโปสเตอร์ภาพถ่ายใหญ่เกินจำเป็น) */
export const prepareAnnouncementImage = async (
  file: Express.Multer.File,
): Promise<Buffer> => {
  try {
    return await sharp(file.buffer, { failOn: 'error' })
      .rotate()
      .resize({
        width: MAX_EDGE,
        height: MAX_EDGE,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
      .toBuffer();
  } catch (error) {
    throw new BadRequestException(
      `Cannot read ${file.originalname} as an image — use PNG, JPEG or WebP (${
        (error as Error).message
      })`,
    );
  }
};
