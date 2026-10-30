import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { GalleryService } from './gallery.service';
import { OrgGalleryService } from './org-gallery.service';
import { OrgGalleryQueryDto } from './dto/org-gallery-query.dto';
import { AuthUser, CurrentUser } from '@ai-media/share';
import { Prisma } from '@prisma/client';
import { Response } from 'express';

@Controller('gallery')
export class GalleryController {
  constructor(
    private readonly galleryService: GalleryService,
    private readonly orgGalleryService: OrgGalleryService,
  ) {}

  @Post()
  create(@Body('body') createGalleryDto: Prisma.GalleryCreateInput) {
    return this.galleryService.create(createGalleryDto);
  }
  @Get()
  findAll() {
    return this.galleryService.findAll();
  }
  @Get('activity/:projectId')
  findByActivity(@Param('projectId') projectId: string, @Query() query: any) {
    return this.galleryService.findByActivity(projectId, query);
  }
  @Get('download/:id')
  async downloadFile(
    @Param('id') id: string,
    @Query() query: any,
    @Res() res: Response,
  ) {
    const { url } = await this.galleryService.downloadFile(id, query);
    // Redirect straight to the presigned TOS URL — the file downloads from
    // object storage, so no media bytes are proxied through this pod.
    res.redirect(302, url);
  }

  // ต้องอยู่ก่อน ':projectId' ไม่งั้น 'org' ถูกจับเป็น projectId
  @Get('org/:organizationId')
  findByOrg(
    @Param('organizationId') organizationId: string,
    @Query() query: OrgGalleryQueryDto,
    @CurrentUser() authUser: AuthUser | undefined,
  ) {
    if (!authUser) throw new UnauthorizedException();
    return this.orgGalleryService.findByOrg(organizationId, authUser.userId, query);
  }

  @Get(':projectId')
  findOne(@Param('projectId') projectId: string, @Query() query: any) {
    return this.galleryService.findMany(projectId, query);
  }

  @Patch('task/:taskId')
  update(
    @Param('taskId') taskId: string,
    @Body('body') updateGalleryDto: Prisma.GalleryUpdateInput,
  ) {
    return this.galleryService.update(taskId, updateGalleryDto);
  }
  @Patch(':id')
  updateById(
    @Param('id') id: string,
    @Body('body') updateGalleryDto: Prisma.GalleryUpdateInput,
  ) {
    return this.galleryService.updateById(id, updateGalleryDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.galleryService.remove(id);
  }
}
