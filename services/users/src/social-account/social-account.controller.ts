import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { SocialPlatform, Public } from '@ai-media/share';
import configs from '../configs';
import { SocialAccountService } from './social-account.service';
import {
  ConnectSocialAccountDto,
  ListSocialAccountDto,
  SocialPlatformParamDto,
} from './dto/connect-social-account.dto';
import { SaveManualTokenDto } from './dto/save-manual-token.dto';

@Controller('social-account')
export class SocialAccountController {
  constructor(private readonly socialAccountService: SocialAccountService) {}

  @Get()
  findMany(@Query() query: ListSocialAccountDto) {
    return this.socialAccountService.findManyByOrganization(
      query.organizationId,
    );
  }

  /**
   * บันทึก token ที่แอดมินระบบวางมือ — เส้นทางสำรองระหว่างรอ app review
   * สิทธิ์: SUPER_ADMIN เท่านั้น (ตรวจใน service)
   */
  @Post('manual')
  saveManualToken(@Body() dto: SaveManualTokenDto) {
    return this.socialAccountService.saveManualToken(dto);
  }

  @Get('connect/:platform')
  connect(
    @Param() params: SocialPlatformParamDto,
    @Query() query: ConnectSocialAccountDto,
  ) {
    return this.socialAccountService.buildConnectUrl(
      params.platform,
      query.organizationId,
      query.userId,
    );
  }

  /**
   * ปลายทางที่ provider เด้งกลับมาหลังผู้ใช้กด consent
   *
   * ไม่ใช้ DTO validation ที่นี่เพราะ provider เป็นคนกำหนด query string เอง
   * (เช่น ส่ง `error=access_denied` มาแทน `code` ตอนผู้ใช้กดยกเลิก)
   * และต้อง redirect กลับหน้าเว็บเสมอ ไม่ใช่ตอบ JSON ให้ผู้ใช้เห็นดิบ ๆ
   */
  // platform redirect กลับมา — ตรวจ state ที่เซ็นไว้แทน token
  @Public()
  @Get('callback/:platform')
  async callback(
    @Param('platform') platform: string,
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') error: string | undefined,
    @Query('error_description') errorDescription: string | undefined,
    @Res() res: Response,
  ) {
    if (error) {
      return res.redirect(
        this.buildReturnUrl('error', errorDescription ?? error),
      );
    }
    if (!code || !state) {
      return res.redirect(
        this.buildReturnUrl('error', 'Missing authorization code'),
      );
    }

    try {
      const result = await this.socialAccountService.handleCallback(
        platform as SocialPlatform,
        code,
        state,
      );
      return res.redirect(
        this.buildReturnUrl('success', `${result.connected} account(s) connected`),
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Connection failed';
      return res.redirect(this.buildReturnUrl('error', message));
    }
  }

  @Delete(':id')
  disconnect(@Param('id') id: string, @Query('userId') userId: string) {
    return this.socialAccountService.disconnect(id, userId);
  }

  /**
   * ประกอบ URL หน้าเว็บที่จะเด้งกลับหลังจบ OAuth
   *
   * @param status ผลลัพธ์ของ flow
   * @param message ข้อความอธิบาย (แสดงใน toast ฝั่ง frontend)
   * @returns URL พร้อม query string
   */
  private buildReturnUrl(status: 'success' | 'error', message: string): string {
    // หน้านี้อยู่นอก /page/* เพราะเป็น popup — ดู app/social-callback/page.tsx
    const base =
      configs().social.frontendReturnUrl ??
      `${configs().frontendUrl ?? ''}/social-callback`;
    const params = new URLSearchParams({ social: status, message });
    return `${base}${base.includes('?') ? '&' : '?'}${params.toString()}`;
  }
}
