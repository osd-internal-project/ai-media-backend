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
  Logger,
} from '@nestjs/common';
import { FileInterceptor, AnyFilesInterceptor } from '@nestjs/platform-express';
import { UploadImageService } from './upload-image.service';

@Controller('upload')
export class UploadImageController {
  constructor(private readonly uploadImageService: UploadImageService) { }

  @Post()
  @UseInterceptors(FileInterceptor('file'))
  async uploadImage(
    @UploadedFile() file: Express.Multer.File,
    @Body(`userId`) userId: string,
    @Body(`index`) index: number,
    @Body(`projectId`) projectId: string,
    @Body(`generateType`) generateType: 'image' | 'video',
    @Body(`uid`) uid: string,
    @Body(`organizationId`) organizationId: string,
  ) {
    return this.uploadImageService.uploadImage(
      userId,
      Number(index),
      projectId,
      generateType,
      file,
      uid,
      organizationId,
    );
  }
  @Post('from-prompt')
  @UseInterceptors(AnyFilesInterceptor())
  async uploadImageFromPrompt(
    @Body(`userId`) userId: string,
    @Body(`index`) index: number,
    @Body(`projectId`) projectId: string,
    @Body(`generateType`) generateType: 'image' | 'video',
    @Body(`uid`) uid: string,
    @Body(`refUid`) refUid: string,
    @Body(`organizationId`) organizationId: string,

    @Body() body: any,
  ) {
    return this.uploadImageService.uploadImageFromPrompt(
      userId,
      Number(index),
      projectId,
      generateType,
      uid,
      refUid,
      organizationId,
    );
  }
  @Post('prompt-guide-image')
  @UseInterceptors(FileInterceptor('file'))
  async uploadPromptGuideImage(
    @UploadedFile() file: Express.Multer.File,
    @Body(`userId`) userId: string,
    @Body(`index`) index: number,
    @Body(`promptGuideId`) promptGuideId: string,
    @Body(`generateType`) generateType: 'image' | 'video',
    @Body(`uid`) uid: string,
    @Body(`organizationId`) organizationId: string,
  ) {
    return this.uploadImageService.uploadPromptGuideImage(
      userId,
      Number(index),
      promptGuideId,
      generateType,
      file,
      uid,
      organizationId,
    );
  }

  @Delete('delete/:uid')
  async deleteImage(@Param(`uid`) uid: string) {
    return this.uploadImageService.deleteImage(uid);
  }

  @Delete('prompt-guide-image/delete/:uid')
  async deletePromptGuideImage(@Param(`uid`) uid: string) {
    return this.uploadImageService.deletePromptGuideImage(uid);
  }
}
