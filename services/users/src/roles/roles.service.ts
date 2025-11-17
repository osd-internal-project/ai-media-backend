import { Injectable } from '@nestjs/common';
import { RolesRepository } from '@ai-media/share';
import type { Prisma } from '@prisma/client';

@Injectable()
export class RolesService {
  constructor(private readonly rolesRepo: RolesRepository) {}

  create(createRoleDto: Prisma.roleCreateInput) {
    return this.rolesRepo.create({ data: createRoleDto });
  }

  findAll() {
    return this.rolesRepo.findMany({ orderBy: { createdAt: 'asc' } });
  }

  findOne(roleId: string) {
    return this.rolesRepo.findOne({ where: { roleId } });
  }

  update(roleId: string, updateRoleDto: Prisma.roleUpdateInput) {
    return this.rolesRepo.update({
      where: {
        roleId,
      },
      data: updateRoleDto,
    });
  }

  remove(roleId: string) {
    return this.rolesRepo.delete({
      where: {
        roleId,
      },
    });
  }
}
