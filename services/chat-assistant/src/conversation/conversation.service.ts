import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@ai-media/share';
import {
  CreateConversationDto,
  UpdateConversationDto,
} from './dto/conversation.dto';

/**
 * ทุกเมธอดที่แตะบทสนทนาใบใดใบหนึ่งรับ `userId` ของผู้เรียกมาด้วยเสมอ และตรวจว่า
 * เป็นเจ้าของก่อนคืนหรือแก้ข้อมูล — เดิมค้นด้วย id อย่างเดียว ใครที่รู้ id ของคนอื่น
 * จึงอ่าน แก้ชื่อ หรือลบบทสนทนาของคนนั้นได้ทั้งหมด
 *
 * ข้อจำกัดที่ต้องรู้: `userId` มาจาก query/body ตรง ๆ ตาม convention ของโปรเจกต์นี้
 * (ยังไม่มี guard กลางในระบบเลย) การตรวจนี้จึงปิดช่องอ้างอิงข้ามผู้ใช้ แต่ไม่ใช่
 * การพิสูจน์ตัวตน
 */
@Injectable()
export class ConversationService {
  private readonly logger = new Logger(ConversationService.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateConversationDto) {
    const conversation = await this.prisma.chatConversation.create({
      data: {
        userId: dto.userId,
        organizationId: dto.organizationId,
        title: dto.title ?? 'New conversation',
        systemPrompt: dto.systemPrompt,
        model: dto.model,
      },
    });
    this.logger.log(
      `Created conversation ${conversation.id} for user ${dto.userId}`,
    );
    return conversation;
  }

  /**
   * หาบทสนทนาของ project นี้ หรือสร้างใหม่ถ้ายังไม่มี
   *
   * ค้นด้วย projectId + userId อยู่แล้ว จึงคืนได้เฉพาะของผู้เรียกเองโดยธรรมชาติ
   */
  async set(dto: CreateConversationDto) {
    const conversation = await this.prisma.chatConversation.findFirst({
      where: { projectId: dto.projectId, userId: dto.userId },
    });
    if (conversation) return conversation;

    return this.prisma.chatConversation.create({
      data: {
        userId: dto.userId,
        organizationId: dto.organizationId,
        projectId: dto.projectId,
        title: `${dto.projectId}-${dto.userId}`,
        systemPrompt: dto.systemPrompt,
        model: dto.model,
      },
    });
  }

  async findAll(userId: string, organizationId?: string) {
    return this.prisma.chatConversation.findMany({
      where: {
        userId,
        ...(organizationId ? { organizationId } : {}),
        status: 'active',
      },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        title: true,
        model: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { messages: true } },
      },
    });
  }

  async findOne(id: string, userId: string) {
    await this.assertOwned(id, userId);
    return this.prisma.chatConversation.findUnique({
      where: { id },
      include: {
        _count: { select: { messages: true, tokenUsage: true } },
      },
    });
  }

  /**
   * ข้อความล่าสุดของบทสนทนา
   *
   * ดึงจากท้ายแล้วกลับลำดับ — เดิมใช้ `asc` + `take` ซึ่งได้ N ข้อความแรก ทำให้
   * หน้าจอที่เปิดบทสนทนายาว ๆ เห็นแต่ตอนต้นและไม่เห็นสิ่งที่เพิ่งคุยกัน
   */
  async findMessages(id: string, userId: string, limit = 50) {
    await this.assertOwned(id, userId);

    const messages = await this.prisma.chatMessage.findMany({
      where: { conversationId: id },
      orderBy: { sequence: 'desc' },
      take: limit,
    });
    return messages.reverse();
  }

  async update(id: string, dto: UpdateConversationDto) {
    await this.assertOwned(id, dto.userId);
    return this.prisma.chatConversation.update({
      where: { id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
        ...(dto.systemPrompt !== undefined
          ? { systemPrompt: dto.systemPrompt }
          : {}),
      },
    });
  }

  async remove(id: string, userId: string) {
    await this.assertOwned(id, userId);
    // soft delete — ประวัติการใช้ token ยังต้องอ่านย้อนหลังได้
    return this.prisma.chatConversation.update({
      where: { id },
      data: { status: 'deleted' },
    });
  }

  async getTokenUsageSummary(conversationId: string, userId: string) {
    await this.assertOwned(conversationId, userId);

    const usage = await this.prisma.chatTokenUsage.aggregate({
      where: { conversationId },
      _sum: {
        promptTokens: true,
        completionTokens: true,
        totalTokens: true,
      },
      _count: { id: true },
    });

    return {
      conversationId,
      totalApiCalls: usage._count.id,
      totalPromptTokens: usage._sum.promptTokens ?? 0,
      totalCompletionTokens: usage._sum.completionTokens ?? 0,
      totalTokens: usage._sum.totalTokens ?? 0,
    };
  }

  /**
   * ตรวจว่าบทสนทนามีอยู่จริงและเป็นของผู้เรียก
   *
   * @param id id ของบทสนทนา
   * @param userId ผู้เรียก
   * @throws NotFoundException เมื่อไม่พบ
   * @throws ForbiddenException เมื่อเป็นของผู้ใช้คนอื่น
   */
  private async assertOwned(id: string, userId: string): Promise<void> {
    const conversation = await this.prisma.chatConversation.findUnique({
      where: { id },
      select: { userId: true },
    });
    if (!conversation) {
      throw new NotFoundException(`Conversation ${id} not found`);
    }
    if (conversation.userId !== userId) {
      throw new ForbiddenException('This conversation belongs to another user');
    }
  }
}
