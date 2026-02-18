import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Injectable, Logger } from '@nestjs/common';
import { WebsocketService } from './websocket.service';
import { GenerateService } from 'src/generate/generate.service';
import {
  RequestImageGenerateDto,
  RequestVideoGenerateDto,
} from '@ai-media/share';
import Redis from 'ioredis';
import { InjectRedis } from '@nestjs-modules/ioredis';
import { redisConfigs } from '../configs';
import { LogsService } from 'src/logs/logs.service';

import { JoinRoomDto, LeaveRoomDto, SendMessageDto } from './dto/chat.dto';

@WebSocketGateway({
  path: '/websockets',
  cors: { origin: '*', credentials: true },
  transports: ['websocket'],
})
@Injectable()
export class WebsocketGatewayService
  implements OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit
{
  private readonly logger = new Logger(WebsocketGatewayService.name);

  @WebSocketServer()
  server: Server;
  private redisSubscriber: Redis;

  constructor(
    @InjectRedis() private readonly redis: Redis,
    private readonly workerService: WebsocketService,
    private readonly generateService: GenerateService,
    private readonly logsService: LogsService,
  ) {
    // สร้าง Redis Subscriber แยกสำหรับรับ events จาก Worker
    const redisConf = redisConfigs();
    this.logger.log('Redis Sub Config:', {
      host: redisConf.redisHost,
      port: redisConf.redisPort,
    });

    this.redisSubscriber = new Redis({
      host: redisConf.redisHost,
      port: redisConf.redisPort,
      password: redisConf.redisPassword,
      retryStrategy: (times) => {
        return Math.min(times * 50, 2000);
      },
    });

    this.redisSubscriber.on('error', (err) => {
      this.logger.error('Redis Subscriber Error:', err);
    });
  }

  afterInit(server: Server) {
    this.logger.log('✅ WebSocket Gateway Initialized');
  }

  async handleConnection(client: Socket) {
    this.logger.log(`🔌 Client connected: ${client.id}`);

    await this.redis.hset(
      'ws:clients',
      client.id,
      JSON.stringify({
        connectedAt: new Date().toISOString(),
        ip: client.handshake.address,
      }),
    );

    await this.redis.sadd('ws:active-clients', client.id);

    // client.emit('connected', {
    //   clientId: client.id,
    //   message: 'Connected to WebSocket server',
    //   timestamp: new Date().toISOString(),
    // });
  }

  async onModuleInit() {
    // Subscribe to Worker events
    await this.redisSubscriber.subscribe(
      'worker:started',
      'worker:progress',
      'worker:image-complete',
      'worker:error',
      'worker:complete',
      'worker:video-started',
      'worker:video-progress',
      'worker:video-url-success',
      'worker:video-upload-success',
      'worker:video-complete',
      'worker:video-error',
      'worker:omnihumen-started',
      'worker:omnihumen-progress',
      'worker:omnihumen-url-success',
      'worker:omnihumen-upload-success',
      'worker:omnihumen-complete',
      'worker:omnihumen-error',
      'worker:dreamactor-started',
      'worker:dreamactor-progress',
      'worker:dreamactor-url-success',
      'worker:dreamactor-upload-success',
      'worker:dreamactor-complete',
      'worker:dreamactor-error',
    );

    // รับ messages จาก Worker
    this.redisSubscriber.on('message', async (channel, message) => {
      try {
        const data = JSON.parse(message);
        const { clientId, event, payload } = data;
        this.logger.log(`📨 Received from worker [${channel}]:`, event);
        // this.logger.debug(`📨 Received from worker [${channel}]:`, payload);

        // Check format for room broadcast
        if (payload && payload.projectId && payload.type) {
          const roomName = `${payload.projectId}:${payload.type}`;
          this.server.to(roomName).emit(event, payload);
          // Also emit to specific client if needed/redundant but safe
          // if (clientId) {
          //   this.server.to(clientId).emit(event, payload);
          // }
        } else {
          // Fallback: ส่ง event ไปยัง client ที่เกี่ยวข้องแบบเดิม
          if (clientId) {
            this.server.to(clientId).emit(event, payload);
          } else {
            // Broadcast ถ้าไม่มี clientId และไม่มี room info
            this.server.emit(event, payload);
          }
        }
      } catch (error) {
        this.logger.error('Error processing worker message:', error);
      }
    });
    this.logger.log(
      '✅ WebSocket Gateway initialized and listening to worker events',
    );
  }

  async handleDisconnect(client: Socket) {
    this.logger.log(`🔌 Client disconnected: ${client.id}`);

    // ลบ client จาก Redis
    await this.redis.hdel('ws:clients', client.id);
    await this.redis.srem('ws:active-clients', client.id);

    // ยกเลิก tasks ที่เกี่ยวข้อง (ถ้ามี)
    const activeTasks = await this.redis.smembers(
      `ws:client-tasks:${client.id}`,
    );
    for (const taskId of activeTasks) {
      await this.generateService.cancelTask(taskId);
    }
    await this.redis.del(`ws:client-tasks:${client.id}`);
  }

  @SubscribeMessage('generate')
  async handleGenerate(
    @MessageBody() data: RequestImageGenerateDto,
    @ConnectedSocket() client: Socket,
  ) {
    try {
      this.logger.log('🎨 Generate request from client: ', client.id);

      const { projectId } = data;
      const roomName = `${projectId}:image`;

      // เรียก service เพื่อสร้าง task
      // Broadcast to room
      const result = await this.generateService.createGenerationTask(
        data,
        client.id,
      );
      this.server.to(roomName).emit('task:started', {
        taskId: data.taskId,
        message: 'Task started',
        timestamp: new Date().toISOString(),
        status: result.status,
        data: result.data,
      });
      this.logger.log('🎨 Generate result from data: ', result);
      if (result.status !== 200) {
        client.emit('generate:error', {
          taskId: data.taskId,
          message: result.data,
        });
        // [NEW] Return error acknowledgement
        return { success: false, message: result.data };
      }
      //[NEW] Explicitly check if data is a string to satisfy TypeScript
      if (typeof result.data === 'string') {
        client.emit('generate:error', {
          taskId: data.taskId,
          message: 'Invalid response from generation service',
        });
        // [NEW] Return error acknowledgement
        return {
          success: false,
          message: 'Invalid response from generation service',
        };
      }

      // บันทึก task ที่เกี่ยวข้องกับ client
      await this.redis.sadd(`ws:client-tasks:${client.id}`, result.data.taskId);

      // Broadcast to room
      this.server.to(roomName).emit('task:created', { ...result });

      // [NEW] Return success acknowledgement
      return { success: true, data: result };
    } catch (error) {
      this.logger.error('Generate error:', error);
      client.emit('generate:error', {
        taskId: data.taskId,
        message: error.message || 'Internal server error',
      });
      // [NEW] Return error acknowledgement
      return {
        success: false,
        message: error.message || 'Internal server error',
      };
    }
  }

  @SubscribeMessage('generate:video')
  async handleGenerateVideo(
    @MessageBody() data: RequestVideoGenerateDto,
    @ConnectedSocket() client: Socket,
  ) {
    try {
      this.logger.log('🎥 Generate Video request from client: ', client.id);

      const { projectId } = data;
      const roomName = `${projectId}:video`;

      const result = await this.generateService.createVideoGenerationTask(
        data,
        client.id,
      );

      // Broadcast to room
      this.server.to(roomName).emit('video-task:created', {
        taskId: data.taskId,
        message: 'Video Task started',
        timestamp: new Date().toISOString(),
        status: result.status,
        data: result.data,
      });

      this.logger.log('🎥 Generate Video result: ', result);

      if (result.status !== 200) {
        client.emit('video-generate:error', {
          taskId: data.taskId,
          message: result.data,
        });
        return { success: false, message: result.data };
      }

      if (typeof result.data === 'string') {
        client.emit('video-generate:error', {
          taskId: data.taskId,
          message: 'Invalid response from generation service',
        });
        return {
          success: false,
          message: 'Invalid response from generation service',
        };
      }

      await this.redis.sadd(`ws:client-tasks:${client.id}`, result.data.taskId);

      // Broadcast to room
      this.server
        .to(roomName)
        .emit('task-video:started', { ...result, oldTaskId: data.taskId });

      return { success: true, data: result };
    } catch (error) {
      this.logger.error('Generate video error:', error);
      client.emit('video-generate:error', {
        taskId: data.taskId,
        message: error.message || 'Internal server error',
      });
      return {
        success: false,
        message: error.message || 'Internal server error',
      };
    }
  }

  @SubscribeMessage('generate:omnihumen')
  async handleGenerateOmniHumen(
    @MessageBody() data: RequestVideoGenerateDto,
    @ConnectedSocket() client: Socket,
  ) {
    try {
      this.logger.log('🎥 Generate OmniHumen request from client: ', client.id);

      const { projectId } = data;
      const roomName = `${projectId}:omnihumen`;

      const result = await this.generateService.createOmnihumenGenerationTask(
        data,
        client.id,
      );

      // Broadcast to room
      this.server.to(roomName).emit('omnihumen-task:created', {
        taskId: data.taskId,
        message: 'OmniHumen Task started',
        timestamp: new Date().toISOString(),
        status: result.status,
        data: result.data,
      });

      this.logger.log('🎥 Generate OmniHumen result: ', result);

      if (result.status !== 200) {
        client.emit('omnihumen-generate:error', {
          taskId: data.taskId,
          message: result.data,
        });
        return { success: false, message: result.data };
      }

      if (typeof result.data === 'string') {
        client.emit('omnihumen-generate:error', {
          taskId: data.taskId,
          message: 'Invalid response from generation service',
        });
        return {
          success: false,
          message: 'Invalid response from generation service',
        };
      }

      await this.redis.sadd(`ws:client-tasks:${client.id}`, result.data.taskId);

      // Broadcast to room
      this.server
        .to(roomName)
        .emit('task-omnihumen:started', { ...result, oldTaskId: data.taskId });

      return { success: true, data: result };
    } catch (error) {
      this.logger.error('Generate video error:', error);
      client.emit('omnihumen-generate:error', {
        taskId: data.taskId,
        message: error.message || 'Internal server error',
      });
      return {
        success: false,
        message: error.message || 'Internal server error',
      };
    }
  }

  @SubscribeMessage('generate:dreamactor')
  async handleGenerateDreamactor(
    @MessageBody() data: RequestVideoGenerateDto,
    @ConnectedSocket() client: Socket,
  ) {
    try {
      this.logger.log(
        '🎥 Generate Dreamactor request from client: ',
        client.id,
      );

      const { projectId } = data;
      const roomName = `${projectId}:dreamactor`;

      const result = await this.generateService.createDreamactorGenerationTask(
        data,
        client.id,
      );

      // Broadcast to room
      this.server.to(roomName).emit('dreamactor-task:created', {
        taskId: data.taskId,
        message: 'OmniHumen Task started',
        timestamp: new Date().toISOString(),
        status: result.status,
        data: result.data,
      });

      this.logger.log('🎥 Generate Dreamactor result: ', result);

      if (result.status !== 200) {
        client.emit('dreamactor-generate:error', {
          taskId: data.taskId,
          message: result.data,
        });
        return { success: false, message: result.data };
      }

      if (typeof result.data === 'string') {
        client.emit('dreamactor-generate:error', {
          taskId: data.taskId,
          message: 'Invalid response from generation service',
        });
        return {
          success: false,
          message: 'Invalid response from generation service',
        };
      }

      await this.redis.sadd(`ws:client-tasks:${client.id}`, result.data.taskId);

      // Broadcast to room
      this.server
        .to(roomName)
        .emit('task-dreamactor:started', { ...result, oldTaskId: data.taskId });

      return { success: true, data: result };
    } catch (error) {
      this.logger.error('Generate video error:', error);
      client.emit('dreamactor-generate:error', {
        taskId: data.taskId,
        message: error.message || 'Internal server error',
      });
      return {
        success: false,
        message: error.message || 'Internal server error',
      };
    }
  }

  @SubscribeMessage('chat:get-history')
  async handleGetHistory(
    @MessageBody()
    data: {
      projectId: string;
      organizationId: string;
      skip: number;
      take: number;
      type: 'image' | 'video' | 'omnihumen' | 'dreamactor';
    },
    @ConnectedSocket() client: Socket,
  ) {
    const projectId = data.projectId;
    const organizationId = data.organizationId;
    try {
      const conversation =
        data.type === 'image'
          ? await this.logsService.findProjectImageByPage(
              projectId,
              organizationId,
              data.skip,
              data.take,
            )
          : data.type === 'video'
          ? await this.logsService.findProjectVideoByPage(
              projectId,
              organizationId,
              data.skip,
              data.take,
            )
          : data.type === 'omnihumen'
          ? await this.logsService.findProjectOmniHumenByPage(
              projectId,
              organizationId,
              data.skip,
              data.take,
            )
          : data.type === 'dreamactor'
          ? await this.logsService.findProjectDreamactorByPage(
              projectId,
              organizationId,
              data.skip,
              data.take,
            )
          : [];

      client.emit('chat:history', {
        success: true,
        data: { messages: conversation },
      });
    } catch (error) {
      client.emit('chat:error', {
        message: error.message,
      });
    }
  }

  @SubscribeMessage('task:status')
  async handleGetTaskStatus(
    @MessageBody() data: { taskId: string },
    @ConnectedSocket() client: Socket,
  ) {
    try {
      const status = await this.generateService.getTaskStatus(data.taskId);
      client.emit('task:status', status);
    } catch (error) {
      client.emit('error', { message: error.message });
    }
  }

  @SubscribeMessage('task:cancel')
  async handleCancelTask(
    @MessageBody() data: { taskId: string },
    @ConnectedSocket() client: Socket,
  ) {
    try {
      const result = await this.generateService.cancelTask(data.taskId);

      // ลบออกจาก client tasks
      await this.redis.srem(`ws:client-tasks:${client.id}`, data.taskId);

      client.emit('task:cancelled', result);
    } catch (error) {
      client.emit('error', { message: error.message });
    }
  }

  // Group Chat Handlers

  @SubscribeMessage('join-room')
  async handleJoinRoom(
    @MessageBody() data: JoinRoomDto,
    @ConnectedSocket() client: Socket,
  ) {
    try {
      const { projectId, type } = data;
      const roomName = `${projectId}:${type}`;
      await client.join(roomName);
      this.logger.log(`Client ${client.id} joined room ${roomName}`);
      client.emit('room:joined', {
        projectId,
        type,
        message: `Joined room ${roomName}`,
      });
    } catch (error) {
      this.logger.error(`Error joining room: ${error.message}`);
      client.emit('error', { message: 'Failed to join room' });
    }
  }

  @SubscribeMessage('leave-room')
  async handleLeaveRoom(
    @MessageBody() data: LeaveRoomDto,
    @ConnectedSocket() client: Socket,
  ) {
    try {
      const { projectId, type } = data;
      const roomName = `${projectId}:${type}`;
      await client.leave(roomName);
      this.logger.log(`Client ${client.id} left room ${roomName}`);
      client.emit('room:left', {
        projectId,
        type,
        message: `Left room ${roomName}`,
      });
    } catch (error) {
      this.logger.error(`Error leaving room: ${error.message}`);
      client.emit('error', { message: 'Failed to leave room' });
    }
  }

  @SubscribeMessage('send-message')
  async handleSendMessage(
    @MessageBody() data: SendMessageDto,
    @ConnectedSocket() client: Socket,
  ) {
    try {
      const { projectId, type, message, senderId, senderName, senderAvatar } =
        data;
      const roomName = `${projectId}:${type}`;
      const payload = {
        id: new Date().getTime().toString(), // Helper ID for frontend key
        projectId,
        type,
        message,
        senderId: senderId || client.id,
        senderName,
        senderAvatar,
        timestamp: new Date().toISOString(),
      };

      // Broadcast to room (including sender)
      this.server.to(roomName).emit('chat:message', payload);
      this.logger.log(`Message sent to room ${roomName}: ${message}`);
    } catch (error) {
      this.logger.error(`Error sending message: ${error.message}`);
      client.emit('error', { message: 'Failed to send message' });
    }
  }

  @SubscribeMessage('ping')
  handlePing(@ConnectedSocket() client: Socket) {
    client.emit('pong', { timestamp: new Date().toISOString() });
  }

  /**
   * Helper method สำหรับ REST API ส่ง notification
   */
  async sendToClient(clientId: string, event: string, data: any) {
    this.server.to(clientId).emit(event, data);
  }

  async broadcast(event: string, data: any) {
    this.server.emit(event, data);
  }

  async getConnectedClients(): Promise<string[]> {
    return await this.redis.smembers('ws:active-clients');
  }

  async onModuleDestroy() {
    await this.redisSubscriber.quit();
  }
}
