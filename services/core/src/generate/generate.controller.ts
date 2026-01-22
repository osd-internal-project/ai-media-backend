import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import {
  QUEUE_NAME_IMAGE,
  QUEUE_NAME_VDO,
  CreateGenerateDto
} from '@ai-media/share';
import { GenerateService } from './generate.service';

@Controller('generate')
export class GenerateController {
  constructor(@InjectQueue(QUEUE_NAME_VDO) private videoQueue: Queue, private readonly generateService: GenerateService) { }

  @Post('image')
  async createImage(@Body('body') body: CreateGenerateDto) {
    // return await this.generateService.validateErrorImage(body);
  }

  @Post('video')
  async createVideo(@Body('body') body: CreateGenerateDto) {
    // const error = await this.generateService.validateError(body);
    // if (error) {
    //   throw error;
    // }
    await this.videoQueue.add(QUEUE_NAME_VDO, body);
    return { status: 'queued' };
  }
}
