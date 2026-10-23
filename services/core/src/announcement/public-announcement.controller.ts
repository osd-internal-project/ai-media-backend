import { Controller, Get } from '@nestjs/common';
import { Public } from '@ai-media/share';
import { AnnouncementService } from './announcement.service';

// หน้า home/features/pricing — ไม่ต้อง login, คืนเฉพาะประกาศที่ active
@Public()
@Controller('public/announcement')
export class PublicAnnouncementController {
  constructor(private readonly announcementService: AnnouncementService) {}

  @Get()
  findActive() {
    return this.announcementService.findActive();
  }
}
