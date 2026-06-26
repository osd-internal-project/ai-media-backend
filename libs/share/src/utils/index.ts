import { Prisma } from '@prisma/client';
import { Request } from 'express';

const { Decimal } = Prisma;

const createReadableId = (len: number) => {
  const result = [];
  const list = 'abcdefhknprstxyz23456789';
  for (let i = 0; i < len; i += 1) {
    result.push(list.charAt(Math.floor(Math.random() * list.length)));
  }
  return result.join('');
};

const getIPFromRequest = (req: Request): string | undefined => {
  const xIp = req.headers['x-forwarded-for'];
  if (xIp) {
    if (typeof xIp === 'string') return xIp.trim();
    return xIp.map((x: string) => x.trim()).join(',');
  }
  return req.connection.remoteAddress?.trim();
};

const generateOtp = (length: number) => {
  const digits = '0123456789';
  let OTP = '';
  for (let i = 0; i < length; i++) {
    OTP += digits[Math.floor(Math.random() * 10)];
  }
  return OTP;
};

export const randStrReadable = (len: number) => {
  const result = [];
  const list = 'abcdefhknprstxyz';
  for (let i = 0; i < len; i += 1) {
    result.push(list.charAt(Math.floor(Math.random() * list.length)));
  }
  return result.join('');
};

export const randDigitReadable = (len: number) => {
  const result = [];
  const list = '23456789';
  for (let i = 0; i < len; i += 1) {
    result.push(list.charAt(Math.floor(Math.random() * list.length)));
  }
  return result.join('');
};

const generateRefCode = (id: string | number) => {
  const digits = id.toString().split('');
  const checkDigit = digits.reduce((a, b) => Number(a) + Number(b), 0) % 10;
  return { result: `${id}-${checkDigit}`, id, checkDigit };
};

const checkRefCode = (code: string) => {
  const [number, checkDigit] = code.split('-');
  const check = generateRefCode(number);
  if (check.checkDigit === Number(checkDigit)) return true;
  return false;
};

export function removeMultipleBlank(s: string): string {
  const result = [];
  let lastBlank = false;
  for (const c of s) {
    if (c === ' ' || c === '\t' || c.charCodeAt(0) === 8203) {
      if (!lastBlank) result.push(' ');
      lastBlank = true;
    } else {
      lastBlank = false;
      result.push(c);
    }
  }
  return result.join('');
}

const formatToNormalType = (obj: object) => {
  Object.keys(obj).forEach((key) => {
    if (obj[key] instanceof Decimal) {
      obj[key] = obj[key].toNumber();
    }
    if (typeof obj[key] === 'bigint') {
      obj[key] = +obj[key].toString();
    }
  });
  return obj;
};
export const utils = {
  createReadableId,
  getIPFromRequest,
  generateOtp,
  randStrReadable,
  randDigitReadable,
  generateRefCode,
  checkRefCode,
  formatToNormalType,
};

/**
 * คืน list ของ object name (output ทุกรูปใน generation เดียว) จาก gallery row
 * - ใช้ resultUrl[] ใหม่เป็นหลัก
 * - ถ้า resultUrl ว่าง (data เก่า) fallback ไป imageUrl เดี่ยว
 * หมายเหตุ: คืนเป็น object name ไม่ใช่ presigned URL
 * @param gallery แถว gallery ที่มี resultUrl และ/หรือ imageUrl
 * @returns array ของ object name (อาจว่างถ้าไม่มีทั้งคู่)
 */
export function resolveGalleryResultUrls(gallery: {
  resultUrl?: string[] | null;
  imageUrl?: string | null;
}): string[] {
  if (gallery.resultUrl && gallery.resultUrl.length > 0) return gallery.resultUrl;
  if (gallery.imageUrl) return [gallery.imageUrl];
  return [];
}
