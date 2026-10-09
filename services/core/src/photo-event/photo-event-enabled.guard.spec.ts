import {
  ExecutionContext,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PhotoEventEnabledGuard } from './photo-event-enabled.guard';

const contextFor = (projectId: string): ExecutionContext =>
  ({
    switchToHttp: () => ({ getRequest: () => ({ params: { projectId } }) }),
  } as unknown as ExecutionContext);

describe('PhotoEventEnabledGuard', () => {
  let projectRepo: { findOne: jest.Mock };
  let organizationRepo: { findOne: jest.Mock };
  let guard: PhotoEventEnabledGuard;

  beforeEach(() => {
    projectRepo = {
      findOne: jest.fn().mockResolvedValue({ organizationId: 'org-1' }),
    };
    organizationRepo = {
      findOne: jest
        .fn()
        .mockResolvedValue({ accessCodes: ['image', 'photo_event'] }),
    };
    guard = new PhotoEventEnabledGuard(
      projectRepo as never,
      organizationRepo as never,
    );
  });

  it('lets the request through when the org has photo_event', async () => {
    await expect(guard.canActivate(contextFor('p1'))).resolves.toBe(true);
    expect(organizationRepo.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organizationId: 'org-1' } }),
    );
  });

  it('accepts the code regardless of case/whitespace', async () => {
    organizationRepo.findOne.mockResolvedValue({
      accessCodes: [' Photo_Event '],
    });
    await expect(guard.canActivate(contextFor('p1'))).resolves.toBe(true);
  });

  it('403 when the org has not been granted photo_event', async () => {
    organizationRepo.findOne.mockResolvedValue({
      accessCodes: ['image', 'video', 'omni', 'dream'],
    });
    await expect(guard.canActivate(contextFor('p1'))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('403 when the organization row is missing', async () => {
    organizationRepo.findOne.mockResolvedValue(null);
    await expect(guard.canActivate(contextFor('p1'))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('404 when the project does not exist', async () => {
    projectRepo.findOne.mockResolvedValue(null);
    await expect(guard.canActivate(contextFor('p1'))).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(organizationRepo.findOne).not.toHaveBeenCalled();
  });

  it('404 when the project has no organization', async () => {
    projectRepo.findOne.mockResolvedValue({ organizationId: null });
    await expect(guard.canActivate(contextFor('p1'))).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
