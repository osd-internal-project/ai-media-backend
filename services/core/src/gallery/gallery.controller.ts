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
} from '@nestjs/common';
import { GalleryService } from './gallery.service';
import { Prisma } from '@prisma/client';
import { Response } from 'express';

@Controller('gallery')
export class GalleryController {
  constructor(private readonly galleryService: GalleryService) {}

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
    const { file, name ,type} = await this.galleryService.downloadFile(id, query);
    // console.log(name);
    res.set({
      'Content-Disposition': `inline; filename="${name}"`,
      'Content-Type':type,
    });
    res.send(file);
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
