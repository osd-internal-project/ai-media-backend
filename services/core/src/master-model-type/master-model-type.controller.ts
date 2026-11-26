import { Controller, Get, Post, Body, Patch, Param, Delete, Query, UseGuards } from '@nestjs/common';
import { authMode, AuthUser, CurrentUser, isSystemAdmin, SystemAdminGuard } from '@ai-media/share';
import { MasterModelTypeService } from './master-model-type.service';
import { Prisma } from '@prisma/client';

@Controller('master-model-type')
export class MasterModelTypeController {
  constructor(private readonly masterModelTypeService: MasterModelTypeService) {}

  @Post()
  @UseGuards(SystemAdminGuard)
  create(@Body() createMasterModelTypeDto: Prisma.MasterModelTypeCreateInput) {
    return this.masterModelTypeService.create(createMasterModelTypeDto);
  }

  @Get()
  findAll(
    @Query('includeInactive') includeInactive?: string,
    @CurrentUser() authUser?: AuthUser,
  ) {
    return this.masterModelTypeService.findAll(includeInactive === 'true' && (authMode() === 'off' || isSystemAdmin(authUser)));
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.masterModelTypeService.findOne(+id);
  }

  @Patch(':id')
  @UseGuards(SystemAdminGuard)
  update(
    @Param('id') id: string,
    @Body() updateMasterModelTypeDto: Prisma.MasterModelTypeUpdateInput,
    @CurrentUser() authUser?: AuthUser,
  ) {
    return this.masterModelTypeService.update(+id, updateMasterModelTypeDto, authUser);
  }

  @Delete(':id')
  @UseGuards(SystemAdminGuard)
  remove(@Param('id') id: string) {
    return this.masterModelTypeService.remove(+id);
  }
}
