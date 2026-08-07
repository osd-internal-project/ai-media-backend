import { Injectable, Logger } from '@nestjs/common';
import { TosService } from '../tos-sdk';
import {
  REF_IMAGE_PLACEHOLDER,
  buildOutputKey,
  isAbsoluteUrl,
} from './storage-keys';

/**
 * จุดเดียวที่แปลง "storage reference" (object key หรือ URL) ให้เป็น URL ที่ใช้งานได้
 *
 * กติกาที่ service นี้บังคับใช้:
 *  1. DB และ job payload เก็บ object key เสมอ (presigned URL หมดอายุ)
 *  2. response ที่ส่งให้ frontend เป็น URL เสมอ (ห้ามหลุด key ออกไปเป็น <img src>)
 *  3. ค่าที่เป็น http(s) อยู่แล้วให้ผ่านตรง ๆ — reference จาก workflow/frontend
 *     เป็นลิงก์เต็มอยู่แล้ว การ presign ซ้ำจะพัง
 *  4. read path พังแบบ soft (คืน placeholder), send path พังแบบ hard (throw)
 *     เพื่อไม่ให้ยิง `url: undefined` ไปหา provider เงียบ ๆ อีก
 */
@Injectable()
export class StorageUrlService {
  private readonly logger = new Logger(StorageUrlService.name);

  constructor(private readonly tosService: TosService) {}

  /** bucket ปัจจุบัน — อ่านตอนเรียกใช้ ไม่ cache ตอน construct เพื่อให้ test override env ได้ */
  private get bucket(): string {
    return process.env.TOS_BUCKET!;
  }

  /**
   * แปลง reference เป็น URL สำหรับแสดงผล (read path — ไม่ throw)
   *
   * @param value object key หรือ URL (รับ null/undefined ได้)
   * @param placeholder ค่าที่คืนเมื่อ presign ล้มเหลว (default = รูป "No Image", ส่ง null ได้)
   * @returns URL ที่ใช้แสดงผลได้, null เมื่อ value ว่าง
   */
  async toDisplayUrl(
    value: string | null | undefined,
    placeholder: string | null = REF_IMAGE_PLACEHOLDER,
  ): Promise<string | null> {
    if (!value) return null;
    if (isAbsoluteUrl(value)) return value;
    try {
      return await this.tosService.getPreSignedUrl(this.bucket, value);
    } catch (error) {
      this.logger.warn(
        `presign failed for "${value}": ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return placeholder;
    }
  }

  /**
   * แปลง reference หลายค่าพร้อมกัน โดยตัดค่าว่างทิ้ง
   *
   * @param values list ของ object key หรือ URL
   * @returns list ของ URL (สั้นกว่า input ได้ถ้ามีค่าว่าง)
   */
  async toDisplayUrls(
    values: readonly (string | null | undefined)[],
  ): Promise<string[]> {
    const urls = await Promise.all(values.map((v) => this.toDisplayUrl(v)));
    return urls.filter((url): url is string => Boolean(url));
  }

  /**
   * แปลง reference เป็น URL สำหรับแสดงผล โดยเช็คก่อนว่าไฟล์มีอยู่จริง
   *
   * ใช้กับ reference image เก่าที่อาจถูกลบไปแล้ว — เดิม logic นี้ถูกเขียนซ้ำ 5 ที่
   * ใน logs.service และสองในนั้น prefix path ผิดจนคืน placeholder เสมอ
   *
   * @param value object key หรือ URL
   * @returns URL เมื่อไฟล์มีอยู่, placeholder เมื่อไม่พบหรือ presign ล้มเหลว
   */
  async toVerifiedDisplayUrl(
    value: string | null | undefined,
  ): Promise<string> {
    if (!value) return REF_IMAGE_PLACEHOLDER;
    if (isAbsoluteUrl(value)) return value;
    const exists = await this.tosService.headObject(this.bucket, value);
    if (!exists) return REF_IMAGE_PLACEHOLDER;
    return (await this.toDisplayUrl(value)) ?? REF_IMAGE_PLACEHOLDER;
  }

  /**
   * แปลง reference หลายค่าแบบเช็คการมีอยู่จริง
   *
   * @param values list ของ object key หรือ URL
   * @returns list ความยาวเท่า input (ค่าที่ resolve ไม่ได้เป็น placeholder)
   */
  async toVerifiedDisplayUrls(
    values: readonly (string | null | undefined)[],
  ): Promise<string[]> {
    return Promise.all(values.map((v) => this.toVerifiedDisplayUrl(v)));
  }

  /**
   * แปลง reference เป็น URL สำหรับยิงให้ provider (send path — throw เมื่อพัง)
   *
   * ต่างจาก toDisplayUrl ตรงที่ยอมให้ job fail ดีกว่าส่ง url ว่างไปให้ provider
   * แล้วได้ error ที่ debug ไม่ออก
   *
   * @param value object key หรือ URL
   * @returns URL ที่ provider ดาวน์โหลดได้
   * @throws เมื่อ value ว่าง หรือ presign ไม่สำเร็จ
   */
  async toProviderUrl(value: string | null | undefined): Promise<string> {
    if (!value) {
      throw new Error('Storage reference is empty — cannot build provider URL');
    }
    if (isAbsoluteUrl(value)) return value;
    const url = await this.tosService.getPreSignedUrl(this.bucket, value);
    if (!url) {
      throw new Error(`Failed to presign storage reference "${value}"`);
    }
    return url;
  }

  /**
   * แปลง reference หลายค่าสำหรับ send path
   *
   * @param values list ของ object key หรือ URL
   * @returns list ของ URL ความยาวเท่า input
   * @throws เมื่อมีค่าใดค่าหนึ่ง resolve ไม่ได้
   */
  async toProviderUrls(
    values: readonly (string | null | undefined)[],
  ): Promise<string[]> {
    return Promise.all(values.map((v) => this.toProviderUrl(v)));
  }

  /**
   * สร้าง URL ที่บังคับให้ browser ดาวน์โหลดไฟล์ด้วยชื่อ/ชนิดที่กำหนด
   *
   * @param key object key ใน bucket
   * @param options contentType / contentDisposition ที่จะฝังใน presigned URL
   * @returns URL สำหรับดาวน์โหลด, null เมื่อ key ว่างหรือ presign ล้มเหลว
   */
  async toDownloadUrl(
    key: string | null | undefined,
    options?: { contentType?: string; contentDisposition?: string },
  ): Promise<string | null> {
    if (!key) return null;
    try {
      return await this.tosService.getPreSignedUrl(this.bucket, key, options);
    } catch (error) {
      this.logger.warn(
        `download presign failed for "${key}": ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return null;
    }
  }

  /**
   * ประกอบ key ของไฟล์ผลลัพธ์แล้ว presign ให้ในขั้นตอนเดียว
   *
   * @param organizationId รหัสองค์กร
   * @param projectId รหัสโปรเจกต์
   * @param typeGenerate ชนิดการ generate เช่น `image` | `video`
   * @param objectName ชื่อไฟล์ใน bucket
   * @returns URL สำหรับแสดงผล, null เมื่อไม่มี objectName หรือ presign ไม่สำเร็จ
   */
  async resolveOutputUrl(
    organizationId: string,
    projectId: string,
    typeGenerate: string,
    objectName: string | null | undefined,
  ): Promise<string | null> {
    if (!objectName) return null;
    // objectName ที่เป็น URL เต็มอยู่แล้ว (data เก่า) ห้ามเอาไปต่อ path
    if (isAbsoluteUrl(objectName)) return objectName;
    const key = buildOutputKey(
      organizationId,
      projectId,
      typeGenerate,
      objectName,
    );
    // output เป็นไฟล์สื่อจริง (รูป/วิดีโอ) — ถ้า presign ไม่ผ่านให้คืน null
    // ไม่ใช่ placeholder รูป "No Image" ซึ่งจะกลายเป็น src ของ <video> ที่ผิดความหมาย
    return this.toDisplayUrl(key, null);
  }
}
