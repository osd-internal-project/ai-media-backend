import {
  AuditLogRepository,
  ErrorLogRepository,
  GalleryRepository,
  LogRepository,
  MasterDataConfigApiRepository,
  MasterdataModelTypeRepository,
  ProjectMemberRepository,
  QUEUE_NAME_IMAGE,
  UsersRepository,
  ByteplusePayloadImage,
  RequestImageGenerateDto,
  RequestVideoGenerateDto,
  QUEUE_NAME_VDO,
  ByteplusePayloadVideo,
  TosService,
  QUEUE_NAME_OMNIHUMEN,
  ByteplusePayloadOmnihumen,
  ByteplusePayloadDreamactor,
  QUEUE_NAME_DREAMACTOR,
  CreditBalanceRepository,
  ProjectRepository,
  MasterModelTypeDto,
  RequestAudioGenerateDto,
} from '@ai-media/share';
import { InjectRedis } from '@nestjs-modules/ioredis';
import { InjectQueue } from '@nestjs/bullmq';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import axios, { AxiosRequestConfig } from 'axios';
import { Queue } from 'bullmq';
import e from 'express';
import * as https from 'https';
import Redis from 'ioredis';
import { tosConfigs } from 'src/configs';
import { GenerateDreamactorService } from './generate-dreamactor.service';
import { GenerateAudioService } from './generate-audio.service';
import { GenerateImageService } from './generate-image.service';
import { GenerateOmnihumanService } from './generate-omnihuman.service';
import { GenerateVideoService } from './generate-video.service';

@Injectable()
export class GenerateService {
  constructor(
    private readonly projectRepo: ProjectRepository,
    private readonly projectMemberRepo: ProjectMemberRepository,
    private readonly userRepo: UsersRepository,
    private readonly errorLogRepo: ErrorLogRepository,
    private readonly auditLogRepo: AuditLogRepository,
    private readonly masterModelTypeRepo: MasterdataModelTypeRepository,
    private readonly creditBalanceRepo: CreditBalanceRepository,
    private readonly generateImageService: GenerateImageService,
    private readonly generateVideoService: GenerateVideoService,
    private readonly generateOmnihumanService: GenerateOmnihumanService,
    private readonly generateDreamactorService: GenerateDreamactorService,
    private readonly generateAudioService: GenerateAudioService,

    @InjectRedis() private readonly redis: Redis,
  ) {}

  /**
   * สร้าง Generation Task และส่งเข้า Queue
   */

  async createImageGenerationTask(body: any, clientId: string) {
    return await this.generateImageService.createImageGenerationTask(
      body,
      clientId,
    );
  }

  async createVideoGenerationTask(body: any, clientId: string) {
    return await this.generateVideoService.createVideoGenerationTask(
      body,
      clientId,
    );
  }

  async createOmnihumenGenerationTask(body: any, clientId: string) {
    return await this.generateOmnihumanService.createOmnihumenGenerationTask(
      body,
      clientId,
    );
  }

  async createDreamactorGenerationTask(body: any, clientId: string) {
    return await this.generateDreamactorService.createDreamactorGenerationTask(
      body,
      clientId,
    );
  }

  async createAudioGenerationTask(
    body: RequestAudioGenerateDto,
    clientId: string,
  ) {
    return await this.generateAudioService.createAudioGenerationTask(
      body,
      clientId,
    );
  }

  async getImageTaskStatus(taskId: string) {
    return await this.generateImageService.getTaskStatus(taskId);
  }

  async cancelImageTask(taskId: string) {
    return await this.generateImageService.cancelTask(taskId);
  }

  /**
   * ดึงรายการ tasks ของ user
   */
  async getUserTasks(userId: string, limit = 20) {
    const keys = await this.redis.keys(`task:*`);
    const tasks = [];

    for (const key of keys.slice(0, limit)) {
      const data = await this.redis.get(key);
      if (data) {
        const task = JSON.parse(data);
        if (task.userId === userId) {
          tasks.push(task);
        }
      }
    }

    return tasks.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }

  
}
