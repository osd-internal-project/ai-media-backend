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
import { BrandKitDetailService } from './brand-kit-detail.service';
import { Prisma } from '@prisma/client';

@Controller('brand-kit-detail')
export class BrandKitDetailController {
  constructor(private readonly brandKitDetailService: BrandKitDetailService) {}

  @Post()
  create(@Body() data: Prisma.BrandKitDetailCreateInput) {
    return this.brandKitDetailService.create(data);
  }

  @Get()
  findAll(@Query() query: any) {
    return this.brandKitDetailService.findAll(query);
  }

  @Get('type/:type/brand-kit/:brandKitId')
  findByBrandKitAndType(
    @Param('type') type: string,
    @Param('brandKitId') brandKitId: string,
  ) {
    return this.brandKitDetailService.findByBrandKitAndType(type, brandKitId);
  }

  @Get('brand-kit/:brandKitId')
  findByBrandKit(@Param('brandKitId') brandKitId: string) {
    return this.brandKitDetailService.findByBrandKit(brandKitId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.brandKitDetailService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() data: Prisma.BrandKitDetailUpdateInput,
  ) {
    return this.brandKitDetailService.update(id, data);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.brandKitDetailService.remove(id);
  }
}
