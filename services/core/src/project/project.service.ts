import { Injectable } from '@nestjs/common';
import { ProjectRepository, UsersRepository } from '@ai-media/share';
import { Prisma } from '@prisma/client';

@Injectable()
export class ProjectService {
  constructor(
    private readonly projectRepo: ProjectRepository,
    private readonly usersRepo: UsersRepository,
  ) {}
  create(createProjectDto: any) {
    return this.projectRepo.create({
      data: {
        name: createProjectDto.name,
        description: createProjectDto.description,
        members: createProjectDto.members?.length
          ? {
              create: createProjectDto.members.map((userId) => ({
                users: { connect: { userId: userId } },
              })),
            }
          : undefined,
      },
    });
  }

  findAll() {
    return this.projectRepo.findMany({ include: { members: true } });
  }

  async findOne(id: string) {
    const user = await this.usersRepo.findOne({
      where: { token: id },
    });
    if (!user) {
      throw new Error('User not found for this token');
    }
    return this.projectRepo.findMany({
      where: { members: { some: { userId: user.userId } } },
    });
  }
  async findById(id: string) {
    return this.projectRepo.findOne({ where: { id } });
  }

  update(id: string, updateProjectDto: Prisma.ProjectUpdateInput) {
    return this.projectRepo.update({ where: { id }, data: updateProjectDto });
  }

  remove(id: string) {
    return this.projectRepo.delete({ where: { id } });
  }
}
