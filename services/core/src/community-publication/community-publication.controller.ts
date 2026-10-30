import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import {
  ApiKeyGuard,
  ApiKeyScopes,
  AuthUser,
  CurrentUser,
  Public,
} from '@ai-media/share';
import { CommunityPublicationService } from './community-publication.service';
import { CommunityWebhookDto, PublishToCommunityDto } from './dto/community-publication.dto';

const requireUser = (user: AuthUser | undefined): AuthUser => {
  if (!user) throw new UnauthorizedException();
  return user;
};

/** ผู้ใช้ AI Cave (token ของ Keycloak) — ทั้งจากหน้า Gallery และจาก Community ที่ส่ง token ของ user มา */
@Controller('community')
export class CommunityPublicationController {
  constructor(private readonly service: CommunityPublicationService) {}

  @Post('publications')
  publish(@CurrentUser() user: AuthUser | undefined, @Body() dto: PublishToCommunityDto) {
    return this.service.publish(requireUser(user), dto);
  }

  @Delete('publications/:id')
  unpublish(
    @CurrentUser() user: AuthUser | undefined,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.unpublish(requireUser(user), id);
  }

  @Post('link')
  link(@CurrentUser() user: AuthUser | undefined) {
    return this.service.link(requireUser(user));
  }
}

/** ระบบ Community เรียกด้วย `x-api-key` ที่ SUPER_ADMIN ออกให้ */
@Public()
@UseGuards(ApiKeyGuard)
@Controller('community/webhook')
export class CommunityWebhookController {
  constructor(private readonly service: CommunityPublicationService) {}

  @ApiKeyScopes('webhook')
  @Post()
  receive(@Body() dto: CommunityWebhookDto) {
    return this.service.applyWebhook(dto);
  }
}

/** URL คงที่ของไฟล์ preview — 302 ไป presigned ใหม่ทุกครั้ง แบบเดียวกับ public/community/:slug/media */
@Public()
@Controller('public/community-publication')
export class PublicCommunityPublicationController {
  constructor(private readonly service: CommunityPublicationService) {}

  @Get(':id/media/:index')
  async media(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('index', ParseIntPipe) index: number,
    @Query('thumbnail') thumbnail: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const url = await this.service.resolvePreviewUrl(
      id,
      index,
      thumbnail === '1' || thumbnail === 'true',
    );
    res.redirect(302, url);
  }
}
