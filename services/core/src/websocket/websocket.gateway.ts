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
import { CreateGenerateDto } from '@ai-media/share';
import Redis from 'ioredis';
import { InjectRedis } from '@nestjs-modules/ioredis';
import { redisConfigs } from '../configs';

@WebSocketGateway({
  path: '/websockets',
  cors: { origin: '*', credentials: true },
  transports: ['websocket', 'polling'],
})
@Injectable()
export class WebsocketGateway
  implements OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit
{
  private readonly logger = new Logger(WebsocketGateway.name);

  @WebSocketServer()
  server: Server;
  private redisSubscriber: Redis;

  constructor(
    @InjectRedis() private readonly redis: Redis,
    private readonly workerService: WebsocketService,
    private readonly generateService: GenerateService,
  ) {
    // สร้าง Redis Subscriber แยกสำหรับรับ events จาก Worker
    const redisConf = redisConfigs();
    console.log('Redis Sub Config:', {
      host: redisConf.redisHost,
      port: redisConf.redisPort,
    });

    this.redisSubscriber = new Redis({
      host: redisConf.redisHost || 'localhost',
      port: redisConf.redisPort || 6379,
      password: redisConf.redisPassword,
      retryStrategy: (times) => {
        // limit retry to avoid infinite loop logging if config is wrong
        return Math.min(times * 50, 2000);
      },
    });

    this.redisSubscriber.on('error', (err) => {
      console.error('Redis Subscriber Error:', err);
    });
  }

  afterInit(server: Server) {
    this.logger.log('✅ WebSocket Gateway Initialized');
    this.logger.log(`🔌 Transports: ${server.opts.transports}`);
    this.logger.log(`🔌 Path: ${server.opts.path}`);
  }

  async handleConnection(client: Socket) {
    this.logger.log(`🔌 Client connected: ${client.id}`);

    // บันทึก client mapping ใน Redis (สำหรับ Worker ส่ง message กลับมา)
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

        console.log(`📨 Received from worker [${channel}]:`, event);

        // ส่ง event ไปยัง client ที่เกี่ยวข้อง
        if (clientId) {
          this.server.to(clientId).emit(event, payload);
        } else {
          // Broadcast ถ้าไม่มี clientId
          this.server.emit(event, payload);
        }
      } catch (error) {
        console.error('Error processing worker message:', error);
      }
    });
    console.log(
      '✅ WebSocket Gateway initialized and listening to worker events',
    );
  }

  async handleDisconnect(client: Socket) {
    console.log(`🔌 Client disconnected: ${client.id}`);

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
    @MessageBody() data: CreateGenerateDto,
    @ConnectedSocket() client: Socket,
  ) {
    try {
      console.log(`🎨 Generate request from client: ${client.id}`);

      // เรียก service เพื่อสร้าง task
      const result = await this.generateService.createGenerationTask(
        data,
        client.id, // ส่ง clientId ไปด้วย
      );
      if (result.status !== 200) {
        client.emit('generate:error', {
          message: result.data,
        });
        return;
      }
      // [NEW] Explicitly check if data is a string to satisfy TypeScript
      if (typeof result.data === 'string') {
        client.emit('generate:error', {
          message: 'Invalid response from generation service',
        });
        return;
      }

      // บันทึก task ที่เกี่ยวข้องกับ client
      await this.redis.sadd(`ws:client-tasks:${client.id}`, result.data.taskId);

      // ส่ง confirmation กลับไป
      client.emit('task:created', {
        taskId: result.data.taskId,
        jobId: result.data.jobId,
        estimatedImages: result.data.estimatedImages,
        message: 'Task created and queued for processing',
      });
    } catch (error) {
      console.error('Generate error:', error);
      client.emit('generate:error', {
        message: error.message || 'Internal server error',
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
