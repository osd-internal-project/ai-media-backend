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
import { OrganizationService } from './organization.service';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { Prisma } from '@prisma/client';

@Controller('organization')
export class OrganizationController {
  constructor(private readonly organizationService: OrganizationService) {}

  @Post()
  create(@Body() createOrganizationDto: Prisma.OrganizationCreateInput) {
    return this.organizationService.create(createOrganizationDto);
  }
  @Post('owner')
  createOwner(@Body() createOrganizationDto: Prisma.OrganizationCreateInput) {
    return this.organizationService.createOwner(createOrganizationDto);
  }
  @Get()
  findAll() {
    return this.organizationService.findAll();
  }

  @Get('user/:id')
  findManyByUserId(
    @Param('id') userId: string,
    @Query() search: { type: string },
  ) {
    return this.organizationService.findManyByUserId(userId, search);
  }
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.organizationService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateOrganizationDto: Prisma.OrganizationUpdateInput,
  ) {
    return this.organizationService.update(id, updateOrganizationDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.organizationService.remove(id);
  }
}
