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
  constructor(@InjectQueue(QUEUE_NAME_IMAGE) private imageQueue: Queue, @InjectQueue(QUEUE_NAME_VDO) private videoQueue: Queue, private readonly generateService: GenerateService) { }

  @Post('image')
  async createImage(@Body() body: CreateGenerateDto) {
    const error = await this.generateService.validateError();
    if (error) {
      throw error;
    }
    await this.imageQueue.add(QUEUE_NAME_IMAGE, body);

    return { status: 'queued' };
  }

  @Post('video')
  async createVideo(@Body() body: CreateGenerateDto) {
    await this.videoQueue.add(QUEUE_NAME_VDO, body);
    return { status: 'queued' };
  }
}
