import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UploadedFiles,
  UseInterceptors,
  Logger,
  Query,
  HttpCode,
} from '@nestjs/common';
import { AnyFilesInterceptor } from '@nestjs/platform-express';
import {
  DirectUploadKind,
  PresignUploadInput,
  UploadImageService,
} from './upload-image.service';
import {
  UploadCallbackBody,
  UploadPolicyQuery,
  UploadPolicyService,
} from './upload-policy.service';

@Controller('upload')
export class UploadImageController {
  constructor(
    private readonly uploadImageService: UploadImageService,
    private readonly uploadPolicyService: UploadPolicyService,
  ) {}

  /** PostObject policy ใช้ซ้ำได้ทั้งชั่วโมงภายใน prefix ของ project / prompt guide */
  @Get('policy')
  getUploadPolicy(@Query() query: UploadPolicyQuery) {
    return this.uploadPolicyService.createPolicy(query);
  }

  /** TOS เรียกหลังเก็บไฟล์ — response ถูกส่งต่อให้ browser ใน POST เดียวกัน */
  @Post('callback')
  @HttpCode(200)
  handleUploadCallback(@Body() body: UploadCallbackBody) {
    return this.uploadPolicyService.handleCallback(body);
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
