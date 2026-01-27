// src/websocket/websocket.gateway.ts
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
import { ConfigService } from '@nestjs/config';
import { GenerateService } from 'src/generate/generate.service';
import { CreateGenerateDto, LogRepository, RequestImageGenerateDto } from '@ai-media/share';
import Redis from 'ioredis';
import { InjectRedis } from '@nestjs-modules/ioredis';
import { redisConfigs } from '../configs';
import { LogsService } from 'src/logs/logs.service';

@WebSocketGateway({
  path: '/websockets',
  cors: { origin: '*', credentials: true },
  transports: ['websocket'],
})
@Injectable()
export class WebsocketGatewayService
  implements OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit {
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
      host: redisConf.redisHost || 'localhost',
      port: redisConf.redisPort || 6379,
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

    client.emit('connected', {
      clientId: client.id,
      message: 'Connected to WebSocket server',
      timestamp: new Date().toISOString(),
    });
  }

  async onModuleInit() {
    // Subscribe to Worker events
    await this.redisSubscriber.subscribe(
      'worker:progress',
      'worker:image-complete',
      'worker:complete',
      'worker:error',
      'worker:started',
    );

    // รับ messages จาก Worker
    this.redisSubscriber.on('message', async (channel, message) => {
      try {
        const data = JSON.parse(message);
        const { clientId, event, payload } = data;
        // this.logger.log(`📨 Received from worker [${channel}]:`, data);

        this.logger.log(`📨 Received from worker [${channel}]:`, event);

        // ส่ง event ไปยัง client ที่เกี่ยวข้อง
        if (clientId) {
          this.server.to(clientId).emit(event, payload);
        } else {
          // Broadcast ถ้าไม่มี clientId
          this.server.emit(event, payload);
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

      // // เรียก service เพื่อสร้าง task
      this.server.to(client.id).emit('task:started', {
        message: 'Task started',
        timestamp: new Date().toISOString(),
      });
      const result = await this.generateService.createGenerationTask(
        data,
        client.id, // ส่ง clientId ไปด้วย
      );
      this.logger.log('🎨 Generate result from data: ', result);
      if (result.status !== 200) {
        client.emit('generate:error', {
          message: result.data,
        });
        // [NEW] Return error acknowledgement
        return { success: false, message: result.data };
      }
      // // [NEW] Explicitly check if data is a string to satisfy TypeScript
      if (typeof result.data === 'string') {
        client.emit('generate:error', {
          message: 'Invalid response from generation service',
        });
        // [NEW] Return error acknowledgement
        return { success: false, message: 'Invalid response from generation service' };
      }

      // // บันทึก task ที่เกี่ยวข้องกับ client
      await this.redis.sadd(`ws:client-tasks:${client.id}`, result.data.taskId);

      client.emit('task:created', { ...result });

      // [NEW] Return success acknowledgement
      return { success: true, data: result };

    } catch (error) {
      this.logger.error('Generate error:', error);
      client.emit('generate:error', {
        message: error.message || 'Internal server error',
      });
      // [NEW] Return error acknowledgement
      return { success: false, message: error.message || 'Internal server error' };
    }
  }

  @SubscribeMessage('chat:get-history')
  async handleGetHistory(
    @MessageBody() data: {
      projectId: string,
      skip: number,
      take: number
    },
    @ConnectedSocket() client: Socket,
  ) {
    const projectId = data.projectId;
    try {
      const conversation = await this.logsService.findProjectImageByPage(
        projectId,
        data.skip,
        data.take,
      );

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
