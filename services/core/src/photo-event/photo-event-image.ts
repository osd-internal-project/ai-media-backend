import sharp = require('sharp');
import * as path from 'path';
import { PHOTO_EVENT_MAX_IMAGE_EDGE } from './photo-event.constants';

export interface PreparedPhoto {
  buffer: Buffer;
  extension: string;
  mimetype: string;
}

const JPEG_QUALITY = 90;

/**
 * หมุนตาม EXIF และย่อด้านยาวไม่เกิน PHOTO_EVENT_MAX_IMAGE_EDGE เป็น JPEG
 * ไฟล์ที่ sharp อ่านไม่ได้ (เช่น HEIC) คืนต้นฉบับเหมือนก่อนมีการย่อ
 */
export const preparePhoto = async (
  file: Express.Multer.File,
): Promise<PreparedPhoto & { converted: boolean }> => {
  try {
    const buffer = await sharp(file.buffer, { failOn: 'error' })
      .rotate()
      .resize({
        width: PHOTO_EVENT_MAX_IMAGE_EDGE,
        height: PHOTO_EVENT_MAX_IMAGE_EDGE,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
      .toBuffer();
    return {
      buffer,
      extension: '.jpg',
      mimetype: 'image/jpeg',
      converted: true,
    };
  } catch {
    return {
      buffer: file.buffer,
      extension: path.extname(file.originalname).toLowerCase(),
      mimetype: file.mimetype,
      converted: false,
    };
  }
};
