import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { RolesOfGroupsService } from './roles-of-groups.service';
import { CreateRolesOfGroupDto } from './dto/create-roles-of-group.dto';
import { UpdateRolesOfGroupDto } from './dto/update-roles-of-group.dto';

@Controller('roles-of-groups')
export class RolesOfGroupsController {
  constructor(private readonly rolesOfGroupsService: RolesOfGroupsService) {}

  @Post()
  create(@Body() createRolesOfGroupDto: CreateRolesOfGroupDto) {
    return this.rolesOfGroupsService.create(createRolesOfGroupDto);
  }

  @Get()
  findAll() {
    return this.rolesOfGroupsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.rolesOfGroupsService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateRolesOfGroupDto: UpdateRolesOfGroupDto) {
    return this.rolesOfGroupsService.update(+id, updateRolesOfGroupDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.rolesOfGroupsService.remove(+id);
  }
}
