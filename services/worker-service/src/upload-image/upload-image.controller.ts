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
import {
  DirectUploadKind,
  PresignUploadInput,
  UploadImageService,
} from './upload-image.service';

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

  /** Direct upload ขั้น 1 — คืน presigned PUT URL ให้ browser อัปโหลดตรงเข้า TOS */
  @Post('presign')
  async presignUpload(@Body() body: PresignUploadInput) {
    return this.uploadImageService.presignUpload({
      ...body,
      index: Number(body.index),
      size: Number(body.size),
    });
  }

  /** Direct upload ขั้น 2 — ตรวจไฟล์ใน TOS แล้วเปิดใช้งาน row */
  @Post('confirm')
  async confirmUpload(
    @Body('kind') kind: DirectUploadKind,
    @Body('uid') uid: string,
  ) {
    return this.uploadImageService.confirmUpload(kind, uid);
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
