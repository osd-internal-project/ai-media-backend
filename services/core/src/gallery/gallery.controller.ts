import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
} from '@nestjs/common';
import { GalleryService } from './gallery.service';
import { Prisma } from '@prisma/client';

@Controller('gallery')
export class GalleryController {
  constructor(private readonly galleryService: GalleryService) { }

  @Post()
  create(@Body('body') createGalleryDto: Prisma.GalleryCreateInput) {
    return this.galleryService.create(createGalleryDto);
  }
  @Get()
  findAll() {
    return this.galleryService.findAll();
  }
  @Get(':projectId')
  findOne(@Param('projectId') projectId: string, @Query() query: any) {
    return this.galleryService.findMany(projectId, query);
  }
  @Get('activity/:projectId')
  findByActivity(@Param('projectId') projectId: string, @Query() query: any) {
    return this.galleryService.findByActivity(projectId, query);
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
