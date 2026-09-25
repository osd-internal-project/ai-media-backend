import { Controller, Get, Param, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { PublicRateLimitGuard } from '../public-community/public-rate-limit.guard';
import { PublicPhotoEventService } from './public-photo-event.service';

/** เรียกได้โดยไม่ต้อง login — ลิงก์ใน QR code ของ kiosk */
@Controller('public/photo-event')
@UseGuards(PublicRateLimitGuard)
export class PublicPhotoEventController {
  constructor(private readonly publicService: PublicPhotoEventService) {}

  @Get(':generationId')
  findOne(@Param('generationId') generationId: string) {
    return this.publicService.findOne(generationId);
  }

  /** redirect ไป presigned URL ที่สร้างใหม่ทุกครั้ง ลิงก์ใน QR จึงไม่หมดอายุ */
  @Get(':generationId/download')
  async download(
    @Param('generationId') generationId: string,
    @Res() res: Response,
  ): Promise<void> {
    res.redirect(
      302,
      await this.publicService.resolveDownloadUrl(generationId),
    );
  }
}
