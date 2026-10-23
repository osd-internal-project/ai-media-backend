import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthUser, CurrentUser } from '@ai-media/share';
import { AnnouncementService } from './announcement.service';
import { ANNOUNCEMENT_MAX_FILE_BYTES } from './announcement-image';
import {
  SaveAnnouncementDto,
  SetAnnouncementActiveDto,
} from './dto/save-announcement.dto';

/** จัดการประกาศ — super admin เท่านั้น (ตรวจใน service) */
@Controller('announcement')
export class AnnouncementController {
  constructor(private readonly announcementService: AnnouncementService) {}

  @Get()
  findAll(@CurrentUser() authUser: AuthUser | undefined) {
    return this.announcementService.findAll(authUser);
  }

  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: ANNOUNCEMENT_MAX_FILE_BYTES },
    }),
  )
  create(
    @CurrentUser() authUser: AuthUser | undefined,
    @Body() dto: SaveAnnouncementDto,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    return this.announcementService.create(authUser, dto, file);
  }

  @Patch(':id')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: ANNOUNCEMENT_MAX_FILE_BYTES },
    }),
  )
  update(
    @CurrentUser() authUser: AuthUser | undefined,
    @Param('id') id: string,
    @Body() dto: SaveAnnouncementDto,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    return this.announcementService.update(authUser, id, dto, file);
  }

  @Patch(':id/active')
  setActive(
    @CurrentUser() authUser: AuthUser | undefined,
    @Param('id') id: string,
    @Body() dto: SetAnnouncementActiveDto,
  ) {
    return this.announcementService.setActive(authUser, id, dto.isActive);
  }

  @Delete(':id')
  remove(
    @CurrentUser() authUser: AuthUser | undefined,
    @Param('id') id: string,
  ) {
    return this.announcementService.remove(authUser, id);
  }
}
