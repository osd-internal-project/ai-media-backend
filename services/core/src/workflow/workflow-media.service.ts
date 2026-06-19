import { Injectable, Logger } from '@nestjs/common';
import { ProjectRepository, TosService } from '@ai-media/share';
import { tosConfigs } from 'src/configs';

/**
 * ตัวช่วย presign object ของ output บล็อก ให้เป็น URL ที่แสดงผลได้
 * ใช้ convention เดียวกับ gallery.service.findMany เพื่อให้รูป/วิดีโอแสดงได้ทั้งตอนสด
 * (websocket) และตอนโหลดแคนวาสใหม่ (read)
 */
@Injectable()
export class WorkflowMediaService {
  private readonly logger = new Logger(WorkflowMediaService.name);

  constructor(
    private readonly tosService: TosService,
    private readonly projectRepo: ProjectRepository,
  ) {}

  /**
   * แปลง object name (ที่ worker อัปโหลดไว้) เป็น presigned URL สำหรับแสดงผล
   * path: organize/${org}/${projectId}/${type}-generate/${objectName} (ตรงกับ gallery)
   * @param projectId รหัสโปรเจกต์
   * @param type ชนิดบล็อก ("image" | "video") ใช้ประกอบ path เหมือน typeGenerate
   * @param objectName ชื่อไฟล์ที่เก็บใน object storage
   * @returns presigned URL หรือ null ถ้าไม่มี objectName (fallback: คืน objectName ดิบเมื่อ presign ไม่ได้)
   */
  async presignObject(
    projectId: string,
    type: string,
    objectName: string | null | undefined,
  ): Promise<string | null> {
    if (!objectName) return null;
    try {
      const project = await this.projectRepo.findOne({
        where: { id: projectId },
      });
      const org = project?.organizationId;
      if (!org) return objectName;
      const bucket = tosConfigs().tosBucket;
      const path = `organize/${org}/${projectId}/${type}-generate/${objectName}`;
      return await this.tosService.getPreSignedUrl(bucket, path);
    } catch (error) {
      this.logger.warn(
        `presignObject failed for ${objectName}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return objectName;
    }
  }
}
