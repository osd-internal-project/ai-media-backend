import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { GroupsRepository } from '@ai-media/share';
import type { CreateGroupDto } from './dto/create-group.dto';
import type { UpdateGroupDto } from './dto/update-group.dto';

@Injectable()
export class GroupsService {
  constructor(private readonly groupsRepo: GroupsRepository) {}
  create(createGroupDto: CreateGroupDto) {
    const condition = {
      data: {
        ...createGroupDto,
      },
    } as any;
    return this.groupsRepo.create(condition);
  }

  findAll() {
    return this.groupsRepo.findMany({
      include: {
        users: true,
        roles: true,
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  findOne(groupId: string) {
    return this.groupsRepo.findOne({ where: { groupId } });
  }
  findUserByGroupsId(groupId: string) {
    return this.groupsRepo.findOne({
      where: { groupId },
      include: { users: { include: { users: true } } },
    });
  }
  findRolesByGroupsId(groupId: string) {
    return this.groupsRepo.findOne({
      where: { groupId },
      include: { roles: { include: { role: true } } },
    });
  }
  relationByGroup(groupId: string) {
    return this.groupsRepo.findOne({
      where: { groupId },
      include: {
        roles: { include: { role: true } },
        users: { include: { users: true } },
      },
    });
  }

  update(groupId: string, updateGroupDto: UpdateGroupDto) {
    const { createdAt, id, users, roles, ...values } = updateGroupDto || {};
    return this.groupsRepo.update({
      where: {
        groupId,
      },
      data: {
        ...values,
        ...(users?.length && {
          users: {
            create: updateGroupDto.users.map((userId) => ({
              users: { connect: { userId } },
            })),
          },
        }),
        ...(roles?.length && {
          roles: {
            create: updateGroupDto.roles.map((roleId) => ({
              role: { connect: { roleId } },
            })),
          },
        }),
      },
    });
  }

  remove(groupId: string) {
    return this.groupsRepo.delete({ where: { groupId } });
  }
}
