import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import {
  QUEUE_NAME_IMAGE,
  QUEUE_NAME_VDO,
  QUEUE_NAME_OMNIHUMEN,
  CreateGenerateDto,
} from '@ai-media/share';
import { GenerateService } from './generate.service';

@Controller('generate')
export class GenerateController {
  constructor(
    @InjectQueue(QUEUE_NAME_VDO) private videoQueue: Queue,
    @InjectQueue(QUEUE_NAME_OMNIHUMEN) private omnihumenQueue: Queue,
    private readonly generateService: GenerateService,
  ) {}

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

  @Post('omnihumen')
  async createOmnihumen(@Body('body') body: CreateGenerateDto) {
    // const error = await this.generateService.validateError(body);
    // if (error) {
    //   throw error;
    // }
    await this.omnihumenQueue.add(QUEUE_NAME_OMNIHUMEN, body);
    return { status: 'queued' };
  }
}
