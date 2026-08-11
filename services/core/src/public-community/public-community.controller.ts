import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { Inject } from '@nestjs/common';
import { Request, Response } from 'express';
import { communityConfigs } from '../configs';
import { PublicCommunityService } from './public-community.service';
import {
  PublicFeedQueryDto,
  VisitorDto,
} from './dto/public-community.dto';
import { PublicRateLimitGuard } from './public-rate-limit.guard';

/**
 * หน้า community สาธารณะ — เรียกได้โดยไม่ต้อง login
 *
 * แยกไฟล์จาก CommunityPostController โดยตั้งใจ เพื่อให้ "ส่วนที่คนนอกเข้าถึงได้"
 * มองเห็นชัดตั้งแต่ชื่อไฟล์ กติกา 2 ข้อที่โมดูลนี้ต้องรักษาไว้เสมอ:
 *
 * 1. ทุก query กรอง status = PUBLISHED แบบตายตัว และไม่รับ status จากผู้เรียก
 * 2. payload ทุกชิ้นออกผ่าน PublicCommunityService.toPublicView ที่เดียว
 */
@Controller('public/community')
export class PublicCommunityController {
  constructor(
    private readonly publicCommunityService: PublicCommunityService,
    @Inject(communityConfigs.KEY)
    private readonly config: ConfigType<typeof communityConfigs>,
  ) {}

  @Get()
  findFeed(@Query() query: PublicFeedQueryDto, @Req() request: Request) {
    return this.publicCommunityService.findFeed(query, this.resolveOrigin(request));
  }

  @Get(':slug')
  findBySlug(@Param('slug') slug: string, @Req() request: Request) {
    return this.publicCommunityService.findBySlug(
      slug,
      this.resolveOrigin(request),
    );
  }

  /**
   * redirect ไป presigned URL ที่สร้างใหม่ทุกครั้ง
   *
   * ใช้ 302 ไม่ใช่การ proxy bytes ผ่าน pod นี้ — วิธีเดียวกับ gallery/download/:id
   * และเป็นเหตุผลที่ URL ในหน้า public คงที่พอให้ crawler cache og:image ได้
   */
  @Get(':slug/media/:index')
  async streamMedia(
    @Param('slug') slug: string,
    @Param('index', ParseIntPipe) index: number,
    @Query('thumbnail') thumbnail: string,
    @Res() res: Response,
  ): Promise<void> {
    const url = await this.publicCommunityService.resolveMediaUrl(
      slug,
      index,
      thumbnail === '1' || thumbnail === 'true',
    );
    res.redirect(302, url);
  }

  @Get(':slug/liked')
  hasLiked(@Param('slug') slug: string, @Query('visitorId') visitorId: string) {
    if (!visitorId) return { liked: false };
    return this.publicCommunityService.hasLiked(slug, visitorId);
  }

  @UseGuards(PublicRateLimitGuard)
  @Post(':slug/view')
  registerView(@Param('slug') slug: string) {
    return this.publicCommunityService.registerView(slug);
  }

  @UseGuards(PublicRateLimitGuard)
  @Post(':slug/like')
  toggleLike(@Param('slug') slug: string, @Body() dto: VisitorDto) {
    return this.publicCommunityService.toggleLike(slug, dto.visitorId);
  }

  /**
   * หา origin ที่ใช้ประกอบ URL ของสื่อ
   *
   * ใช้ค่าจาก config ก่อนเสมอ เพราะ URL เหล่านี้ไปโผล่ใน og:image ที่ crawler
   * จะ cache ไว้ — ปล่อยให้ header จาก request กำหนดปลายทางถาวรไม่เหมาะ
   * ส่วน fallback มีไว้ให้ dev ที่ยังไม่ได้ตั้ง env
   *
   * @param request request ที่เข้ามา
   * @returns origin แบบไม่มี / ปิดท้าย
   */
  private resolveOrigin(request: Request): string {
    const configured = this.config.publicApiBaseUrl?.trim();
    if (configured) return configured.replace(/\/+$/, '');

    const proto =
      (request.headers['x-forwarded-proto'] as string)?.split(',')[0]?.trim() ||
      request.protocol;
    return `${proto}://${request.get('host')}`;
  }
}
