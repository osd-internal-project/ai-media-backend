import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UploadedFiles,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UploadImageService } from './upload-image.service';
import { MinioClientService } from '../minio-client/minio-client.service';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';

@Controller('upload')
export class UploadImageController {
  constructor(private readonly uploadImageService: UploadImageService) {}

  @Post()
  @UseInterceptors(FileInterceptor('file'))
  async uploadImage(
    @UploadedFile() file: Express.Multer.File,
    @Body(`userId`) userId: string,
    @Body(`index`) index: number,
    @Body(`projectId`) projectId: string,
    @Body(`generateType`) generateType: 'image' | 'vdo',
    @Body(`uid`) uid: string,
  ) {
    return this.uploadImageService.uploadImage(
      userId,
      Number(index),
      projectId,
      generateType,
      file,
      uid,
    );
  }
  @Post('prompt-guide-image')
  @UseInterceptors(FileInterceptor('file'))
  async uploadPromptGuideImage(
    @UploadedFile() file: Express.Multer.File,
    @Body(`userId`) userId: string,
    @Body(`index`) index: number,
    @Body(`projectId`) projectId: string,
    @Body(`generateType`) generateType: 'image' | 'vdo',
    @Body(`uid`) uid: string,
  ) {
    return this.uploadImageService.uploadImage(
      userId,
      Number(index),
      projectId,
      generateType,
      file,
      uid,
    );
  }

  @Delete('delete/:uid')
  async deleteImage(@Param(`uid`) uid: string) {
    return this.uploadImageService.deleteImage(uid);
  }

  @Delete('prompt-guide-image/delete/:uid')
  async deletePromptGuideImage(@Param(`uid`) uid: string) {
    return this.uploadImageService.deleteImage(uid);
  }
}
