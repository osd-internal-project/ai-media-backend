import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { UsersOfGroupsService } from './users-of-groups.service';
import { CreateUsersOfGroupDto } from './dto/create-users-of-group.dto';
import { UpdateUsersOfGroupDto } from './dto/update-users-of-group.dto';

@Controller('users-of-groups')
export class UsersOfGroupsController {
  constructor(private readonly usersOfGroupsService: UsersOfGroupsService) {}

  @Post()
  create(@Body() createUsersOfGroupDto: CreateUsersOfGroupDto) {
    return this.usersOfGroupsService.create(createUsersOfGroupDto);
  }

  @Get()
  findAll() {
    return this.usersOfGroupsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.usersOfGroupsService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateUsersOfGroupDto: UpdateUsersOfGroupDto) {
    return this.usersOfGroupsService.update(+id, updateUsersOfGroupDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.usersOfGroupsService.remove(+id);
  }
}
