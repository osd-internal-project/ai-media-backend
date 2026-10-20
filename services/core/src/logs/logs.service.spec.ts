import { NotFoundException } from '@nestjs/common';
import { LogsService } from './logs.service';

const log = {
  id: 'log-1',
  taskId: 'task-1',
  typeGenerate: 'video',
  status: 'success',
  prompt: 'say hello',
  usedCredit: 324.2,
  usedImage: null,
  resolution: '720p',
  ratio: '16:9',
  generateAudio: true,
  generateConfig: { duration: 5 },
  createdAt: new Date('2026-10-19T00:00:00Z'),
  projectId: 'p-1',
  userId: 'u-1',
  galleryId: null,
  referenceImages: ['organize/o/upload/ref.png'],
  project: { id: 'p-1', name: 'AI Expo' },
  users: { userId: 'u-1', fullname: 'Taksapong', username: 'tk' },
};

const setup = (found: unknown = log) => {
  const logRepo = { findOne: jest.fn().mockResolvedValue(found) };
  const galleryRepo = {
    findOne: jest.fn().mockResolvedValue({
      id: 'gal-1',
      typeGenerate: 'video',
      resultUrl: ['out.mp4'],
      imageUrl: null,
      thumbnailUrl: 'thumb.jpg',
      genneratedStatus: 'COMPLETED',
    }),
  };
  const storageUrl = {
    resolveOutputUrl: jest.fn(
      async (_org: string, _project: string, _type: string, name: string) =>
        name ? `https://cdn/${name}` : null,
    ),
    toVerifiedDisplayUrls: jest.fn(async (keys: string[]) =>
      keys.map((key) => `https://cdn/${key}`),
    ),
  };
  const service = new LogsService(
    logRepo as never,
    galleryRepo as never,
    {} as never,
    {} as never,
    {} as never,
    storageUrl as never,
    {} as never,
  );
  return { service, logRepo, galleryRepo, storageUrl };
};

describe('LogsService.findDetail', () => {
  it('scopes the lookup to the organization and presigns the media', async () => {
    const { service, logRepo, galleryRepo, storageUrl } = setup();

    const detail = await service.findDetail('log-1', 'org-1');

    expect(logRepo.findOne.mock.calls[0][0].where).toEqual({
      id: 'log-1',
      project: { organizationId: 'org-1' },
    });
    expect(galleryRepo.findOne).toHaveBeenCalledWith({
      where: { taskId: 'task-1' },
    });
    expect(storageUrl.resolveOutputUrl).toHaveBeenCalledWith(
      'org-1',
      'p-1',
      'video',
      'out.mp4',
    );
    expect(detail).toMatchObject({
      id: 'log-1',
      type: 'video',
      projectName: 'AI Expo',
      userFullname: 'Taksapong',
      usedImage: 0,
      galleryId: 'gal-1',
      genneratedStatus: 'COMPLETED',
      resultUrl: ['https://cdn/out.mp4'],
      thumbnailUrl: 'https://cdn/thumb.jpg',
      referenceImages: ['https://cdn/organize/o/upload/ref.png'],
    });
  });

  it('reads a log from another organization as not found', async () => {
    const { service } = setup(null);

    await expect(service.findDetail('log-1', 'org-2')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('refuses to look up without an organization', async () => {
    const { service, logRepo } = setup();

    await expect(service.findDetail('log-1', '')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(logRepo.findOne).not.toHaveBeenCalled();
  });

  it('returns empty media when the log has no gallery row', async () => {
    const { service, galleryRepo } = setup({ ...log, taskId: null });

    const detail = await service.findDetail('log-1', 'org-1');

    expect(galleryRepo.findOne).not.toHaveBeenCalled();
    expect(detail.resultUrl).toEqual([]);
    expect(detail.thumbnailUrl).toBeNull();
  });
});
