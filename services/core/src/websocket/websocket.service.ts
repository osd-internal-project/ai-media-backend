// src/websocket/worker.service.ts
import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import Redis from 'ioredis';
import { Queue, Worker, Job } from 'bullmq';
import { InjectQueue } from '@nestjs/bullmq';
import { InjectRedis } from '@nestjs-modules/ioredis';

interface TaskData {
  clientId: string;
  prompt: string;
  type: string;
}

@Injectable()
export class WebsocketService {

  constructor(
    @InjectRedis() private readonly redis: Redis,
    @InjectQueue(`tasks`) private taskQueue: Queue,
  ) { }

  // async onModuleInit() {
  //   // สร้าง Worker เพื่อประมวลผล tasks
  //   workerQueue = new Worker(
  //     'tasks',
  //     async (job: Job<TaskData>) => {
  //       console.log(`Processing job ${job.id}:`, job.data);
  //       return await this.processTask(job.data);
  //     },
  //     {
  //       connection: {
  //         host: 'localhost',
  //         port: 6379,
  //       },
  //       concurrency: 5, // ประมวลผลพร้อมกัน 5 tasks
  //     },
  //   );

  //   // Event listeners
  //   this.worker.on('completed', (job) => {
  //     console.log(`Job ${job.id} completed`);
  //   });

  //   this.worker.on('failed', (job, err) => {
  //     console.error(`Job ${job?.id} failed:`, err);
  //   });

  //   console.log('Worker service initialized');
  // }

  /**
   * เพิ่ม client ใน Redis
   */
  async addClient(clientId: string): Promise<void> {
    await this.redis.sadd('connected:clients', clientId);
    await this.redis.set(
      `client:${clientId}`,
      JSON.stringify({
        connectedAt: new Date().toISOString(),
        status: 'online',
      }),
      'EX',
      86400, // 24 ชั่วโมง
    );
  }

  /**
   * ลบ client จาก Redis
   */
  async removeClient(clientId: string): Promise<void> {
    await this.redis.srem('connected:clients', clientId);
    await this.redis.del(`client:${clientId}`);
  }

  /**
   * ดึงรายการ clients ทั้งหมด
   */
  async getConnectedClients(): Promise<string[]> {
    return await this.redis.smembers('connected:clients');
  }

  /**
   * เพิ่ม task เข้า Queue
   */
  async addTask(data: TaskData): Promise<string> {
    const job = await this.taskQueue.add('process', data, {
      attempts: 3, // retry 3 ครั้งถ้าล้มเหลว
      backoff: {
        type: 'exponential',
        delay: 1000,
      },
    });

    // บันทึกข้อมูล task ใน Redis
    await this.redis.set(
      `task:${job.id}`,
      JSON.stringify({
        ...data,
        status: 'queued',
        createdAt: new Date().toISOString(),
      }),
      'EX',
      3600,
    );

    return job.id as string;
  }

  /**
   * ประมวลผล task
   */
  private async processTask(data: TaskData): Promise<any> {
    const { clientId, prompt, type } = data;

    // อัพเดทสถานะ
    await this.updateTaskStatus(data, 'processing');

    try {
      // จำลองการประมวลผล
      await this.delay(2000);

      const result = {
        clientId,
        type,
        result: `Processed: ${prompt}`,
        completedAt: new Date().toISOString(),
      };

      // อัพเดทสถานะเป็น completed
      await this.updateTaskStatus(data, 'completed', result);

      return result;
    } catch (error) {
      // อัพเดทสถานะเป็น failed
      await this.updateTaskStatus(data, 'failed', { error: error.message });
      throw error;
    }
  }

  /**
   * อัพเดทสถานะของ task
   */
  private async updateTaskStatus(
    data: TaskData,
    status: string,
    extra?: any,
  ): Promise<void> {
    const key = `task:status:${data.clientId}`;
    await this.redis.set(
      key,
      JSON.stringify({
        ...data,
        status,
        ...extra,
        updatedAt: new Date().toISOString(),
      }),
      'EX',
      3600,
    );
  }

  /**
   * ดึงสถานะของ task
   */
  async getTaskStatus(taskId: string): Promise<any> {
    const data = await this.redis.get(`task:${taskId}`);
    return data ? JSON.parse(data) : null;
  }

  /**
   * Complete task
   */
  async completeTask(taskId: string): Promise<void> {
    const task = await this.getTaskStatus(taskId);
    if (task) {
      task.status = 'completed';
      task.completedAt = new Date().toISOString();
      await this.redis.set(`task:${taskId}`, JSON.stringify(task), 'EX', 3600);
    }
  }

  /**
   * ดึงสถิติจาก Queue
   */
  async getQueueStats(): Promise<any> {
    const waiting = await this.taskQueue.getWaitingCount();
    const active = await this.taskQueue.getActiveCount();
    const completed = await this.taskQueue.getCompletedCount();
    const failed = await this.taskQueue.getFailedCount();

    return {
      waiting,
      active,
      completed,
      failed,
      total: waiting + active + completed + failed,
    };
  }

  /**
   * ล้าง Queue
   */
  async clearQueue(): Promise<void> {
    await this.taskQueue.drain();
    await this.taskQueue.clean(0, 1000, 'completed');
    await this.taskQueue.clean(0, 1000, 'failed');
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async onModuleDestroy() {
    await this.taskQueue.close();
  }
}