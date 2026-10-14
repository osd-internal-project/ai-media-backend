import { Injectable, Logger } from '@nestjs/common';
import {
  ProjectRepository,
  REF_IMAGE_PLACEHOLDER,
  StorageUrlService,
  buildOutputKey,
} from '@ai-media/share';

/**
 * ตัวช่วย resolve object ของ output บล็อก ให้เป็น key/URL ที่ใช้งานได้
 * ใช้ convention เดียวกับ gallery.service.findMany (ผ่าน buildOutputKey ตัวเดียวกัน)
 * เพื่อให้รูป/วิดีโอแสดงได้ทั้งตอนสด (websocket) และตอนโหลดแคนวาสใหม่ (read)
 */
@Injectable()
export class WorkflowMediaService {
  private readonly logger = new Logger(WorkflowMediaService.name);

  constructor(
    private readonly storageUrl: StorageUrlService,
    private readonly projectRepo: ProjectRepository,
  ) {}

  /**
   * หา organizationId ของโปรเจกต์ เพื่อใช้ประกอบ object key
   *
   * @param projectId รหัสโปรเจกต์
   * @returns organizationId หรือ null เมื่อหาไม่เจอ
   */
  private async findOrganizationId(projectId: string): Promise<string | null> {
    const project = await this.projectRepo.findOne({
      where: { id: projectId },
    });
    return project?.organizationId ?? null;
  }

  /**
   * สร้าง canonical object key ของ output บล็อก (ไม่ presign) เพื่อส่งเป็น reference key
   * ให้ pipeline เดิม — worker จะ presign key เองตอนยิง provider และบันทึกลง reference_images
   * เป็น key ถาวร แทน presigned URL ที่หมดอายุ
   *
   * @param projectId รหัสโปรเจกต์
   * @param type ชนิดบล็อก ("image" | "video") ใช้ประกอบ path เหมือน typeGenerate
   * @param objectName ชื่อไฟล์ที่เก็บใน object storage
   * @returns object key, objectName เดิมเมื่อเป็น URL อยู่แล้ว, หรือ null เมื่อไม่มี objectName/org
   */
  async buildObjectKey(
    projectId: string,
    type: string,
    objectName: string | null | undefined,
  ): Promise<string | null> {
    if (!objectName) return null;
    const org = await this.findOrganizationId(projectId);
    if (!org) {
      // เดิมคืน objectName ดิบ ซึ่งกลายเป็น key ที่ presign แล้วชี้ไปไฟล์ที่ไม่มีจริง
      // คืน null แทนเพื่อให้ caller filter ทิ้ง และ log ไว้ให้เห็นว่าเกิดขึ้น
      this.logger.warn(
        `buildObjectKey: project ${projectId} has no organizationId — dropping reference "${objectName}"`,
      );
      return null;
    }
    return buildOutputKey(org, projectId, type, objectName);
  }

  /**
   * แปลง object name ของ output บล็อก เป็น URL สำหรับแสดงผลบนแคนวาส
   *
   * @param projectId รหัสโปรเจกต์
   * @param type ชนิดบล็อก ("image" | "video")
   * @param objectName ชื่อไฟล์ที่เก็บใน object storage
   * @returns URL สำหรับแสดงผล, placeholder เมื่อ resolve ไม่ได้, null เมื่อไม่มี objectName
   */
  async presignObject(
    projectId: string,
    type: string,
    objectName: string | null | undefined,
  ): Promise<string | null> {
    if (!objectName) return null;
    try {
      const org = await this.findOrganizationId(projectId);
      if (!org) return REF_IMAGE_PLACEHOLDER;
      const url = await this.storageUrl.resolveOutputUrl(
        org,
        projectId,
        type,
        objectName,
      );
      return url ?? REF_IMAGE_PLACEHOLDER;
    } catch (error) {
      this.logger.warn(
        `presignObject failed for ${objectName}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      // ห้ามคืน objectName ดิบ — client จะเอาไปใส่ <img src> แล้วได้ broken image
      return REF_IMAGE_PLACEHOLDER;
    }
  }
}
