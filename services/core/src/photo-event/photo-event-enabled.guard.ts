import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OrganizationRepository, ProjectRepository } from '@ai-media/share';
import { Request } from 'express';
import { PHOTO_EVENT_ACCESS_CODE } from './photo-event.constants';

/**
 * Photo Event ใช้ได้เฉพาะ org ที่ super admin เปิด access code `photo_event` ไว้
 * — กันทั้งหน้าจัดการและ kiosk เพราะทั้งคู่เรียกผ่าน `projects/:projectId/photo-event`
 */
@Injectable()
export class PhotoEventEnabledGuard implements CanActivate {
  constructor(
    private readonly projectRepo: ProjectRepository,
    private readonly organizationRepo: OrganizationRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const projectId = context.switchToHttp().getRequest<Request>()
      .params.projectId;
    const project = await this.projectRepo.findOne({
      where: { id: projectId, status: { not: 'deleted' } },
      select: { organizationId: true },
    });
    if (!project) {
      throw new NotFoundException(`Project ${projectId} not found`);
    }
    if (!project.organizationId) {
      throw new NotFoundException(`Project ${projectId} has no organization`);
    }
    const organization = await this.organizationRepo.findOne({
      where: { organizationId: project.organizationId },
      select: { accessCodes: true },
    });
    const enabled = (organization?.accessCodes ?? []).some(
      (code) => code.toLowerCase().trim() === PHOTO_EVENT_ACCESS_CODE,
    );
    if (!enabled) {
      throw new ForbiddenException(
        'Photo Event is not enabled for this organization',
      );
    }
    return true;
  }
}
