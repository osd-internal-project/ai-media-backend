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
import { AuthUser, CurrentUser, Public } from '@ai-media/share';
import { UploadAccessService } from './upload-access.service';

@Controller('upload')
export class UploadImageController {
  constructor(
    private readonly uploadImageService: UploadImageService,
    private readonly uploadPolicyService: UploadPolicyService,
    private readonly uploadAccess: UploadAccessService,
  ) {}

  /** PostObject policy ใช้ซ้ำได้ทั้งชั่วโมงภายใน prefix ของ project / prompt guide */
  @Get('policy')
  async getUploadPolicy(
    @Query() query: UploadPolicyQuery,
    @CurrentUser() user?: AuthUser,
  ) {
    await this.uploadAccess.assertCanWrite(user, {
      organizationId: query.organizationId,
      projectId: query.kind === 'ref' ? query.projectId : undefined,
      promptGuideId:
        query.kind === 'prompt-guide' ? query.promptGuideId : undefined,
    });
    return this.uploadPolicyService.createPolicy(query);
  }

  /** TOS เรียกหลังเก็บไฟล์ — response ถูกส่งต่อให้ browser ใน POST เดียวกัน */
  // TOS เรียกเข้ามา — ตรวจ HMAC ของ scope แทน token
  @Public()
  @Post('callback')
  @HttpCode(200)
  handleUploadCallback(@Body() body: UploadCallbackBody) {
    return this.uploadPolicyService.handleCallback(body);
  }

  @Post('from-prompt')
  // ยังต้อง parse FormData ที่ frontend ส่งมา แต่ไม่รับไฟล์ — เดิมไม่จำกัด ยิงไฟล์ใหญ่เข้า memory ได้
  @UseInterceptors(AnyFilesInterceptor({ limits: { files: 0 } }))
  async uploadImageFromPrompt(
    @Body(`userId`) userId: string,
    @Body(`index`) index: number,
    @Body(`projectId`) projectId: string,
    @Body(`generateType`) generateType: 'image' | 'video',
    @Body(`uid`) uid: string,
    @Body(`refUid`) refUid: string,
    @Body(`organizationId`) organizationId: string,

    @Body() body: any,
    @CurrentUser() user?: AuthUser,
  ) {
    return this.uploadImageService.uploadImageFromPrompt(
      userId,
      Number(index),
      projectId,
      generateType,
      uid,
      refUid,
      organizationId,
      user,
    );
  }

  /** Direct upload ขั้น 1 — คืน presigned PUT URL ให้ browser อัปโหลดตรงเข้า TOS */
  @Post('presign')
  async presignUpload(
    @Body() body: PresignUploadInput,
    @CurrentUser() user?: AuthUser,
  ) {
    return this.uploadImageService.presignUpload(
      {
        ...body,
        index: Number(body.index),
        size: Number(body.size),
      },
      user,
    );
  }

  /** Direct upload ขั้น 2 — ตรวจไฟล์ใน TOS แล้วเปิดใช้งาน row */
  @Post('confirm')
  async confirmUpload(
    @Body('kind') kind: DirectUploadKind,
    @Body('uid') uid: string,
    @CurrentUser() user?: AuthUser,
  ) {
    return this.uploadImageService.confirmUpload(kind, uid, user);
  }

  @Delete('delete/:uid')
  async deleteImage(
    @Param(`uid`) uid: string,
    @CurrentUser() user?: AuthUser,
  ) {
    return this.uploadImageService.deleteImage(uid, user);
  }

  @Delete('prompt-guide-image/delete/:uid')
  async deletePromptGuideImage(
    @Param(`uid`) uid: string,
    @CurrentUser() user?: AuthUser,
  ) {
    return this.uploadImageService.deletePromptGuideImage(uid, user);
  }
}
