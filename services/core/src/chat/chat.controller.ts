import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ChatService } from './chat.service';

@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) { }

  /**
   * สร้าง Conversation ใหม่
   * POST /chat/conversations
   */
  // @Post('conversations')
  // async createConversation(
  //   @Body()
  //   body: {
  //     userId: string;
  //     projectId: string;
  //     title?: string;
  //   },
  // ) {
  //   const conversation = await this.chatService.createConversation(body);
  //   return {
  //     success: true,
  //     data: conversation,
  //   };
  // }

  /**
   * ดึงรายการ Conversations
   * GET /chat/conversations?userId=xxx&projectId=xxx
   */
  // @Get('conversations/:projectId')
  // async getConversations(
  //   @Param('projectId') projectId: string,
  //   @Query('skip') skip?: number,
  //   @Query('take') take?: number,
  // ) {
  //   console.log(`projectId: ${projectId}`)
  //   const conversations = await this.chatService.getUserConversations(
  //     projectId,
  //     skip,
  //     take,
  //   );

  //   return {
  //     success: true,
  //     data: conversations,
  //     count: conversations.length,
  //   };
  // }

  @Get('message/:projectId')
  async getMessage(
    @Param('projectId') projectId: string,
    @Query('skip') skip?: number,
    @Query('take') take?: number,
  ) {
    const conversations = await this.chatService.getMessage(
      projectId,
      skip,
      take,
    );

    return {
      success: true,
      data: conversations,
      count: conversations.length,
    };
  }

  /**
   * ดึง Conversation พร้อม Messages
   * GET /chat/conversations/:id
   */
  // @Get('conversations/:id')
  // async getConversation(@Param('id') id: string) {
  //   const conversation = await this.chatService.getConversationWithMessages(id);

  //   if (!conversation) {
  //     return {
  //       success: false,
  //       message: 'Conversation not found',
  //     };
  //   }

  //   return {
  //     success: true,
  //     data: conversation,
  //   };
  // }

  // /**
  //  * อัพเดท Conversation title
  //  * PUT /chat/conversations/:id
  //  */
  // @Put('conversations/:id')
  // async updateConversation(
  //   @Param('id') id: string,
  //   @Body() body: { userId: string; title: string },
  // ) {
  //   await this.chatService.updateConversationTitle(
  //     id,
  //     body.userId,
  //     body.title,
  //   );

  //   return {
  //     success: true,
  //     message: 'Conversation updated',
  //   };
  // }

  // /**
  //  * ลบ Conversation
  //  * DELETE /chat/conversations/:id
  //  */
  // @Delete('conversations/:id')
  // async deleteConversation(
  //   @Param('id') id: string,
  //   @Query('userId') userId: string,
  // ) {
  //   await this.chatService.deleteConversation(id, userId);

  //   return {
  //     success: true,
  //     message: 'Conversation deleted',
  //   };
  // }

  // /**
  //  * บันทึก User Message
  //  * POST /chat/messages
  //  */
  // @Post('messages')
  // async saveMessage(
  //   @Body()
  //   body: {
  //     conversationId: string;
  //     userId: string;
  //     content: string;
  //     referenceImages?: any[];
  //   },
  // ) {
  //   const message = await this.chatService.saveUserMessage(body);

  //   return {
  //     success: true,
  //     data: message,
  //   };
  // }

  // /**
  //  * ดึง Messages
  //  * GET /chat/messages?conversationId=xxx
  //  */
  // @Get('messages')
  // async getMessages(
  //   @Query('conversationId') conversationId: string,
  //   @Query('limit') limit?: string,
  //   @Query('cursor') cursor?: string,
  // ) {
  //   const messages = await this.chatService.getMessages(
  //     conversationId,
  //     limit ? parseInt(limit) : 50,
  //     cursor,
  //   );

  //   return {
  //     success: true,
  //     data: messages,
  //     count: messages.length,
  //   };
  // }

  // /**
  //  * ค้นหา Messages
  //  * GET /chat/search?userId=xxx&query=dragon
  //  */
  // @Get('search')
  // async searchMessages(
  //   @Query('userId') userId: string,
  //   @Query('query') query: string,
  //   @Query('limit') limit?: string,
  // ) {
  //   const messages = await this.chatService.searchMessages(
  //     userId,
  //     query,
  //     limit ? parseInt(limit) : 20,
  //   );

  //   return {
  //     success: true,
  //     data: messages,
  //     count: messages.length,
  //   };
  // }

  // /**
  //  * ดึงสถิติ
  //  * GET /chat/stats?userId=xxx
  //  */
  // @Get('stats')
  // async getStats(@Query('userId') userId: string) {
  //   const stats = await this.chatService.getConversationStats(userId);

  //   return {
  //     success: true,
  //     data: stats,
  //   };
  // }
}