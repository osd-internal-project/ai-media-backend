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

  @Get(':groupId')
  findOne(@Param('groupId') groupId: string) {
    return this.groupsService.findOne(groupId);
  }

  @Patch(':groupId')
  update(
    @Param('groupId') groupId: string,
    @Body() updateGroupDto: Prisma.groupsUpdateInput,
  ) {
    return this.groupsService.update(groupId, updateGroupDto);
  }

  @Delete(':groupId')
  remove(@Param('groupId') groupId: string) {
    return this.groupsService.remove(groupId);
  }
}
