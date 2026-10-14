import { Injectable, NotFoundException } from '@nestjs/common';
import { WorkflowConversationRepository } from '@ai-media/share';
import { WorkflowBlock, WorkflowConversation } from '@prisma/client';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { WorkflowMediaService } from './workflow-media.service';

/** conversation พร้อม relation blocks (include ใน findOne รับประกัน blocks ตอน runtime) */
type ConversationWithBlocks = WorkflowConversation & {
  blocks: WorkflowBlock[];
};

/**
 * จัดการ WorkflowConversation (รายการแคนวาส workflow ของแต่ละโปรเจกต์)
 * โมดูลนี้แยกอิสระจากฟีเจอร์ Gen Image / Gen Video เดิมโดยสมบูรณ์
 */
@Injectable()
export class WorkflowConversationsService {
  constructor(
    private readonly conversationRepo: WorkflowConversationRepository,
    private readonly mediaService: WorkflowMediaService,
  ) {}

  /**
   * คืนรายการ conversation ทั้งหมดของโปรเจกต์ พร้อมจำนวนบล็อก (block count)
   * @param projectId รหัสโปรเจกต์
   */
  async list(projectId: string) {
    return this.conversationRepo.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { blocks: true } } },
    });
  }

  /**
   * สร้าง conversation ใหม่ภายใต้โปรเจกต์
   * @param projectId รหัสโปรเจกต์
   * @param dto ชื่อ (บังคับ) และคำอธิบาย (ไม่บังคับ)
   */
  async create(projectId: string, dto: CreateConversationDto) {
    return this.conversationRepo.create({
      data: {
        projectId,
        name: dto.name,
        description: dto.description ?? null,
      },
    });
  }

  /**
   * คืน conversation หนึ่งรายการพร้อมบล็อกทั้งหมด (เรียงตามเวลาสร้าง)
   * @param id รหัส conversation
   * @throws NotFoundException เมื่อไม่พบ
   */
  async findOne(id: string) {
    const conversation = (await this.conversationRepo.findOne({
      where: { id },
      include: { blocks: { orderBy: { createdAt: 'asc' } } },
    })) as ConversationWithBlocks | null;
    if (!conversation) {
      throw new NotFoundException(`Workflow conversation ${id} not found`);
    }

    // presign object name ของแต่ละบล็อกตอนอ่าน เพื่อให้รูป/วิดีโอแสดงได้หลังโหลดแคนวาสใหม่
    // (เหมือน gallery ที่ presign ใหม่ทุกครั้งที่โหลด — outputUrl ที่เก็บใน DB เป็น object name ดิบ)
    const blocks = await Promise.all(
      (conversation.blocks ?? []).map(async (block) => ({
        ...block,
        outputUrl: block.outputUrl
          ? await this.mediaService.presignObject(
              conversation.projectId,
              block.type,
              block.outputUrl,
            )
          : block.outputUrl,
      })),
    );

    return { ...conversation, blocks };
  }

  /**
   * ลบ conversation (บล็อกลูกถูกลบอัตโนมัติด้วย onDelete: Cascade)
   * @param id รหัส conversation
   */
  async remove(id: string) {
    await this.findOne(id); // ตรวจว่ามีอยู่จริงก่อนลบ
    await this.conversationRepo.delete({ where: { id } });
    return { success: true };
  }
}
