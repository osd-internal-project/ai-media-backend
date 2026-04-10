import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@ai-media/share';
import { CreateConversationDto, UpdateConversationDto } from './dto/conversation.dto';

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
    this.logger.log(`Created conversation ${conversation.id} for user ${dto.userId}`);
    return conversation;
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

  async findOne(id: string) {
    const conversation = await this.prisma.chatConversation.findUnique({
      where: { id },
      include: {
        _count: { select: { messages: true, tokenUsage: true } },
      },
    });
    if (!conversation) throw new NotFoundException(`Conversation ${id} not found`);
    return conversation;
  }

  async findMessages(id: string, limit: number = 50) {
    const conversation = await this.prisma.chatConversation.findUnique({
      where: { id },
    });
    if (!conversation) throw new NotFoundException(`Conversation ${id} not found`);

    return this.prisma.chatMessage.findMany({
      where: { conversationId: id },
      orderBy: { sequence: 'asc' },
      take: limit,
    });
  }

  async update(id: string, dto: UpdateConversationDto) {
    await this.assertExists(id);
    return this.prisma.chatConversation.update({
      where: { id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
        ...(dto.systemPrompt !== undefined ? { systemPrompt: dto.systemPrompt } : {}),
      },
    });
  }

  async remove(id: string) {
    await this.assertExists(id);
    // Soft-delete by setting status to 'deleted'
    return this.prisma.chatConversation.update({
      where: { id },
      data: { status: 'deleted' },
    });
  }

  async getTokenUsageSummary(conversationId: string) {
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

  private async assertExists(id: string) {
    const exists = await this.prisma.chatConversation.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!exists) throw new NotFoundException(`Conversation ${id} not found`);
  }
}
