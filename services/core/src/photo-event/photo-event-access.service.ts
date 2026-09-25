import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ProjectRepository, UsersRepository } from '@ai-media/share';
import { Project } from '@prisma/client';
import { ProjectService } from '../project/project.service';

/** ตรวจ project และสิทธิ์ของผู้เรียก ก่อนทำงานที่เขียนข้อมูลของ Photo Event */
@Injectable()
export class PhotoEventAccessService {
  constructor(
    private readonly projectRepo: ProjectRepository,
    private readonly projectService: ProjectService,
    private readonly usersRepo: UsersRepository,
  ) {}

  /** คืน project ที่ยัง active และมี organizationId (ต้องใช้ประกอบ storage key) */
  async findActiveProject(
    projectId: string,
  ): Promise<Project & { organizationId: string }> {
    const project = await this.projectRepo.findOne({
      where: { id: projectId, status: { not: 'deleted' } },
    });
    if (!project) {
      throw new NotFoundException(`Project ${projectId} not found`);
    }
    if (!project.organizationId) {
      throw new NotFoundException(`Project ${projectId} has no organization`);
    }
    return { ...project, organizationId: project.organizationId };
  }

  /** @param userToken session.user.id ของ frontend = users.token ไม่ใช่ users.userId */
  async ensurePermission(
    projectId: string,
    userToken: string,
    requiredRole: 'ADMIN' | 'USER' = 'USER',
  ): Promise<void> {
    const user = await this.usersRepo.findOne({ where: { token: userToken } });
    if (!user) throw new ForbiddenException('User not found');
    const allowed = await this.projectService.hasProjectPermission(
      projectId,
      user.userId,
      requiredRole,
    );
    if (!allowed) {
      throw new ForbiddenException(
        `User has no ${requiredRole} permission on project ${projectId}`,
      );
    }
  }
}
