import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { GroupsRepository } from '@ai-media/share';
import type { CreateGroupDto } from './dto/create-group.dto';

@Injectable()
export class GroupsService {
  constructor(private readonly groupsRepo: GroupsRepository) {}
  create(createGroupDto: CreateGroupDto) {
    const condition = {
      data: {
        name: createGroupDto.name,
        // Add Users to Group (only if exists)
        ...(createGroupDto.users?.length && {
          users: {
            create: createGroupDto.users.map((userId) => ({
              user: { connect: { userId } },
            })),
          },
        }),
        // Add Roles to Group (only if exists)
        ...(createGroupDto.roles?.length && {
          roles: {
            create: createGroupDto.roles.map((roleId) => ({
              role: { connect: { roleId } },
            })),
          },
        }),
      },
    } as any;
    return this.groupsRepo.create(condition);
  }

  findAll() {
    return this.groupsRepo.findMany({
      orderBy: { createdAt: 'asc' },
    });
  }

  findOne(groupId: string) {
    return this.groupsRepo.findOne({ where: { groupId } });
  }

  update(groupId: string, updateGroupDto: Prisma.groupsUpdateInput) {
    return this.groupsRepo.update({
      where: {
        groupId,
      },
      data: { ...updateGroupDto },
    });
  }

  remove(groupId: string) {
    return this.groupsRepo.delete({ where: { groupId } });
  }
}
