import sharp = require('sharp');
import { BadRequestException } from '@nestjs/common';
import * as path from 'path';
import {
  PHOTO_EVENT_MAX_IMAGE_EDGE,
  PHOTO_EVENT_PRINT_ASSET_MAX_EDGE,
} from './photo-event.constants';

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

/** พื้นหลัง/icon/กรอบสำหรับพิมพ์ — เก็บเป็น PNG เพื่อคงพื้นโปร่งใส (preparePhoto แปลงเป็น JPEG) */
export const preparePrintAsset = async (
  file: Express.Multer.File,
): Promise<PreparedPhoto> => {
  try {
    const buffer = await sharp(file.buffer, { failOn: 'error' })
      .rotate()
      .resize({
        width: PHOTO_EVENT_PRINT_ASSET_MAX_EDGE,
        height: PHOTO_EVENT_PRINT_ASSET_MAX_EDGE,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .png()
      .toBuffer();
    return { buffer, extension: '.png', mimetype: 'image/png' };
  } catch (error) {
    throw new BadRequestException(
      `Cannot read ${file.originalname} as an image — use PNG, JPEG or WebP (${
        (error as Error).message
      })`,
    );
  }
};
