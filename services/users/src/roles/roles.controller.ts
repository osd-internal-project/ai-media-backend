import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
} from '@nestjs/common';
import { RolesService } from './roles.service';
import type { Prisma } from '@prisma/client';

@Controller('roles')
export class RolesController {
  constructor(private readonly rolesService: RolesService) { }

  @Post()
  create(@Body('body') createRoleDto: Prisma.roleCreateInput) {
    return this.rolesService.create(createRoleDto);
  }

  @Get()
  findAll() {
    return this.rolesService.findAll();
  }

  @Get(':roleId')
  findOne(@Param('roleId') roleId: string) {
    return this.rolesService.findOne(roleId);
  }

  @Patch(':roleId')
  update(
    @Param('roleId') roleId: string,
    @Body('body') updateRoleDto: Prisma.roleUpdateInput,
  ) {
    return this.rolesService.update(roleId, updateRoleDto);
  }

  @Delete(':roleId')
  remove(@Param('roleId') roleId: string) {
    return this.rolesService.remove(roleId);
  }
}
