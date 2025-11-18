import { Injectable } from '@nestjs/common';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { ProjectRepository } from '@ai-media/share';
import { Prisma } from '@prisma/client';

@Injectable()
export class ProjectService {
  constructor(private readonly projectRepo: ProjectRepository) {}
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

  findOne(id: string) {
    return this.projectRepo.findOne({ where: { id } });
  }

  update(id: string, updateProjectDto: Prisma.ProjectUpdateInput) {
    return this.projectRepo.update({ where: { id }, data: updateProjectDto });
  }

  remove(id: string) {
    return this.projectRepo.delete({ where: { id } });
  }
}
