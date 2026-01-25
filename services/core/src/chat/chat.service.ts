import { AuditLogRepository, ErrorLogRepository, GalleryRepository, LogRepository, UsersRepository } from '@ai-media/share';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { minioConfigs } from 'src/configs';
import { MinioClientService } from 'src/minio-client/minio-client.service';

@Injectable()
export class ChatService {
  constructor(@Inject(minioConfigs.KEY)
  private minioconfig: ConfigType<typeof minioConfigs>,
    private readonly logrepo: LogRepository,
    private readonly galleryRepo: GalleryRepository,
    private readonly userRepo: UsersRepository,
    private readonly minioService: MinioClientService,
    private readonly auditLogRepo: AuditLogRepository,
    private readonly errorLogRepo: ErrorLogRepository,) { }

  /**
   * สร้าง Conversation ใหม่
   */
  async createConversation(data: {
    userId: string;
    projectId: string;
    title?: string;
  }) {
    // return await this.logrepo.create({
    //   data: {
    //     userId: data.userId,
    //     projectId: data.projectId,
    //     title: data.title || 'New Conversation',
    //   },
    // });
  }

  /**
   * ดึง Conversations ทั้งหมดของ User
   */
  async getMessage(
    projectId: string,
    skip?: number,
    take?: number,
  ) {
    const taskIds = await this.galleryRepo.findMany({
      where: {
        projectId: projectId,
        taskId: { not: null },
        typeGenerate: 'image',
      },
      select: { taskId: true },
      distinct: ['taskId'],
      orderBy: { createdAt: 'desc' },
      ...(skip !== undefined && take !== undefined && { skip, take }),
    });

    const targetTaskIds = taskIds.map((t) => t.taskId);

    if (targetTaskIds.length === 0) {
      return [];
    }

    const data = await this.galleryRepo.findMany({
      where: {
        taskId: { in: targetTaskIds },
        typeGenerate: 'image',
      },
      include: { users: true },
      orderBy: { createdAt: 'desc' },
    });

    const logData = await this.logrepo.findMany({
      where: {
        taskId: { in: targetTaskIds },
        typeGenerate: 'image',
      },
    });

    const referenceImagesMap = new Map();
    const resolutionMap = new Map();
    const ratioMap = new Map();

    logData.forEach((log) => {
      if (log.referenceImages && log.referenceImages.length > 0) {
        referenceImagesMap.set(log.taskId, log.referenceImages);
      }
      if (log.resolution) {
        resolutionMap.set(log.taskId, log.resolution);
      }
      if (log.ratio) {
        ratioMap.set(log.taskId, log.ratio);
      }
    });
    const map = new Map();

    for (const item of data) {
      const url = item.imageUrl
        ? await this.minioService.getPresignedUrl(
          item.typeGenerate === 'vdo'
            ? this.minioconfig.minioBucketVdo
            : this.minioconfig.minioBucket,
          item.imageUrl,
        )
        : '';
      const thumbnailUrl = item.thumbnailUrl
        ? await this.minioService.getPresignedUrl(
          item.typeGenerate === 'vdo'
            ? this.minioconfig.minioBucketVdo
            : this.minioconfig.minioBucket,
          item.thumbnailUrl,
        )
        : '';

      // Generate presigned URLs for multiple reference images
      const referenceImageFilenames = referenceImagesMap.get(item.taskId);
      let referenceImageUrls = [];
      if (referenceImageFilenames && referenceImageFilenames.length > 0) {
        for (const filename of referenceImageFilenames) {
          const fileStats = await this.minioService.statFile(
            'ai-media-image-upload',
            filename,
          );
          if (fileStats) {
            const url = await this.minioService.getPresignedUrl(
              'ai-media-image-upload',
              filename,
            );
            referenceImageUrls.push(url);
          } else {
            console.log(`Reference image not found: ${filename}`);
            const placeholder =
              'data:image/svg+xml;base64,' +
              Buffer.from(
                `<svg width="32" height="32" xmlns="http://www.w3.org/2000/svg">
                <rect width="32" height="32" fill="#333"/>
                <text x="16" y="18" text-anchor="middle" font-family="Arial" font-size="8" fill="#666">No Image</text>
              </svg>`,
              ).toString('base64');
            referenceImageUrls.push(placeholder);
          }
        }
      }

      if (!map.has(item.taskId)) {
        map.set(item.taskId, {
          ...item,
          referenceImages: referenceImageUrls, // All reference images
          resolution: resolutionMap.get(item.taskId) || null,
          ratio: ratioMap.get(item.taskId) || null,
          imageUrls: [
            {
              imageUrl: url,
              thumbnailUrl: thumbnailUrl,
              id: item.id,
              status: item.status,
            },
          ],
        });
        delete map.get(item.taskId).imageUrl;
        delete map.get(item.taskId).thumbnailUrl;
      } else {
        map.get(item.taskId).imageUrls.push({
          imageUrl: url,
          thumbnailUrl: thumbnailUrl,
          id: item.id,
          status: item.status,
        });
      }
    }
    const result = Array.from(map.values());

    return result;
  }

  // /**
  //  * ดึง Conversation พร้อม Messages ทั้งหมด
  //  */
  // async getConversationWithMessages(conversationId: string) {
  //   return await this.prisma.conversation.findUnique({
  //     where: { id: conversationId },
  //     include: {
  //       messages: {
  //         orderBy: { createdAt: 'asc' }, // เรียงจากเก่าไปใหม่
  //       },
  //     },
  //   });
  // }

  // /**
  //  * บันทึก User Message
  //  */
  // async saveUserMessage(data: {
  //   conversationId: string;
  //   userId: string;
  //   content: string;
  //   referenceImages?: any[];
  // }) {
  //   const message = await this.prisma.chatMessage.create({
  //     data: {
  //       conversationId: data.conversationId,
  //       userId: data.userId,
  //       role: 'user',
  //       content: data.content,
  //       referenceImages: data.referenceImages || [],
  //     },
  //   });

  //   // อัพเดท lastMessageAt
  //   await this.prisma.conversation.update({
  //     where: { id: data.conversationId },
  //     data: { lastMessageAt: new Date() },
  //   });

  //   return message;
  // }

  // /**
  //  * บันทึก Assistant Message (หลังจาก generate เสร็จ)
  //  */
  // async saveAssistantMessage(data: {
  //   conversationId: string;
  //   userId: string;
  //   content: string;
  //   taskId: string;
  //   modelName: string;
  //   generationConfig: any;
  //   images: Array<{
  //     url: string;
  //     thumbnail?: string;
  //     size: string;
  //     index: number;
  //   }>;
  // }) {
  //   const message = await this.prisma.chatMessage.create({
  //     data: {
  //       conversationId: data.conversationId,
  //       userId: data.userId,
  //       role: 'assistant',
  //       content: data.content,
  //       taskId: data.taskId,
  //       modelName: data.modelName,
  //       generationConfig: data.generationConfig,
  //       images: data.images,
  //     },
  //   });

  //   // อัพเดท lastMessageAt
  //   await this.prisma.conversation.update({
  //     where: { id: data.conversationId },
  //     data: { lastMessageAt: new Date() },
  //   });

  //   return message;
  // }

  // /**
  //  * ดึง Messages ของ Conversation (pagination)
  //  */
  // async getMessages(
  //   conversationId: string,
  //   limit = 50,
  //   cursor?: string,
  // ) {
  //   return await this.prisma.chatMessage.findMany({
  //     where: { conversationId },
  //     orderBy: { createdAt: 'asc' },
  //     take: limit,
  //     ...(cursor && {
  //       cursor: { id: cursor },
  //       skip: 1,
  //     }),
  //   });
  // }

  // /**
  //  * ลบ Conversation
  //  */
  // async deleteConversation(conversationId: string, userId: string) {
  //   // ตรวจสอบ ownership
  //   const conversation = await this.prisma.conversation.findFirst({
  //     where: {
  //       id: conversationId,
  //       userId,
  //     },
  //   });

  //   if (!conversation) {
  //     throw new Error('Conversation not found');
  //   }

  //   // Soft delete
  //   return await this.prisma.conversation.update({
  //     where: { id: conversationId },
  //     data: { status: 'deleted' },
  //   });
  // }

  // /**
  //  * อัพเดท Conversation title
  //  */
  // async updateConversationTitle(
  //   conversationId: string,
  //   userId: string,
  //   title: string,
  // ) {
  //   return await this.prisma.conversation.updateMany({
  //     where: {
  //       id: conversationId,
  //       userId,
  //     },
  //     data: { title },
  //   });
  // }

  // /**
  //  * Search Messages
  //  */
  // async searchMessages(userId: string, query: string, limit = 20) {
  //   return await this.prisma.chatMessage.findMany({
  //     where: {
  //       userId,
  //       content: {
  //         contains: query,
  //         mode: 'insensitive',
  //       },
  //     },
  //     include: {
  //       conversation: true,
  //     },
  //     orderBy: { createdAt: 'desc' },
  //     take: limit,
  //   });
  // }

  // /**
  //  * Get conversation stats
  //  */
  // async getConversationStats(userId: string) {
  //   const total = await this.prisma.conversation.count({
  //     where: { userId, status: 'active' },
  //   });

  //   const totalMessages = await this.prisma.chatMessage.count({
  //     where: { userId },
  //   });

  //   const totalImages = await this.prisma.chatMessage.count({
  //     where: {
  //       userId,
  //       role: 'assistant',
  //       images: {
  //         not: [],
  //       },
  //     },
  //   });

  //   return {
  //     totalConversations: total,
  //     totalMessages,
  //     totalGeneratedImages: totalImages,
  //   };
  // }
}