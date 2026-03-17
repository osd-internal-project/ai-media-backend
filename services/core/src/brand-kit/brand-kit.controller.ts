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
import { BrandKitService } from './brand-kit.service';
import { Prisma } from '@prisma/client';

@Controller('brand-kit')
export class BrandKitController {
  constructor(private readonly brandKitService: BrandKitService) {}

  @Post()
  create(@Body() data: Prisma.BrandKitCreateInput) {
    return this.brandKitService.create(data);
  }

  @Get()
  findAll(@Query() query: any) {
    return this.brandKitService.findAll(query);
  }

  @Get('organization/:organizationId')
  findByOrganization(@Param('organizationId') organizationId: string) {
    return this.brandKitService.findByOrganization(organizationId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.brandKitService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() data: Prisma.BrandKitUpdateInput,
  ) {
    return this.brandKitService.update(id, data);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.brandKitService.remove(id);
  }
}
