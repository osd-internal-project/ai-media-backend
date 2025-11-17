import { Prisma } from '@prisma/client';
import { Injectable } from '@nestjs/common';
import { UsersRepository, GroupsRepository } from '@ai-media/share';

@Injectable()
export class UsersService {
  constructor(
    private readonly userRepo: UsersRepository,
    private readonly groupRepo: GroupsRepository,
  ) {}

  create(createUserDto: Prisma.usersCreateInput) {
    return this.userRepo.create({ data: createUserDto });
  }

  findAll() {
    return this.userRepo.findMany({
      include: { groups: true },
      orderBy: { createdAt: 'asc' },
    });
  }
  async summaryData() {
    const [totalUsers, activeUsers, unabledUsers, totalGroups] =
      await Promise.all([
        this.userRepo.count({}),
        this.userRepo.count({ where: { status: 'active' } }),
        this.userRepo.count({ where: { status: 'unabled' } }),
        this.groupRepo.count({}),
      ]);
    return {
      total: totalUsers,
      active: activeUsers,
      unabled: unabledUsers,
      userGroup: totalGroups,
    };
  }

  findOne(userId: string) {
    return this.userRepo.findMany({
      where: {
        userId,
      },
    });
  }

  update(userId: string, updateUserDto: Prisma.usersUpdateInput) {
    return this.userRepo.update({
      where: { userId },
      data: {
        ...updateUserDto,
      },
    });
  }

  remove(userId: string) {
    return this.userRepo.delete({
      where: {
        userId,
      },
    });
  }
}
