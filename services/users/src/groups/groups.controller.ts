import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
} from '@nestjs/common';
import { GroupsService } from './groups.service';
import type { Prisma } from '@prisma/client';
import type { CreateGroupDto } from './dto/create-group.dto';
import type { UpdateGroupDto } from './dto/update-group.dto';

@Controller('groups')
export class GroupsController {
  constructor(private readonly groupsService: GroupsService) {}

  @Post()
  create(@Body('body') createGroupDto: CreateGroupDto) {
    return this.groupsService.create(createGroupDto);
  }

  @Get()
  findAll() {
    return this.groupsService.findAll();
  }
  @Get('relation-by-group/:groupId')
  relationByGroup(@Param('groupId') groupId: string) {
    return this.groupsService.relationByGroup(groupId);
  }
  @Get(':groupId')
  findOne(@Param('groupId') groupId: string) {
    return this.groupsService.findOne(groupId);
  }

  @Get('user-by-groupId/:groupId')
  findUserByGroupsId(@Param('groupId') groupId: string) {
    return this.groupsService.findUserByGroupsId(groupId);
  }
  @Get('roles-by-groupId/:groupId')
  findRolesByGroupsId(@Param('groupId') groupId: string) {
    return this.groupsService.findRolesByGroupsId(groupId);
  }

  @Get('users/:userId')
  findById(@Param('userId') userId: string) {
    console.log(userId);

    return this.groupsService.findByUserId(userId);
  }

  @Patch(':groupId')
  update(
    @Param('groupId') groupId: string,
    @Body('body') updateGroupDto: UpdateGroupDto,
  ) {
    return this.groupsService.update(groupId, updateGroupDto);
  }

  @Delete(':groupId')
  remove(@Param('groupId') groupId: string) {
    return this.groupsService.remove(groupId);
  }
}
