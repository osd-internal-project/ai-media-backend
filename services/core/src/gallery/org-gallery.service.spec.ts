import { ForbiddenException } from '@nestjs/common';
import { OrgGalleryService } from './org-gallery.service';

const row = (id: string, userId: string, modelName: string) => ({
  id,
  projectId: 'p1',
  userId,
  typeGenerate: 'video',
  prompt: 'a cat',
  createdAt: new Date('2026-10-30T00:00:00Z'),
  resultUrl: [`${id}.mp4`],
  imageUrl: null,
  thumbnailUrl: `${id}.jpg`,
  generateConfig: { modelName, duration: 5 },
  users: { userId, fullname: userId },
  publication: null,
});

describe('OrgGalleryService.findByOrg', () => {
  let findMany: jest.Mock;
  let role: string | null;
  let service: OrgGalleryService;

  beforeEach(() => {
    role = 'OWNER';
    findMany = jest.fn().mockResolvedValue([
      row('mine-ok', 'me', 'seedance'),
      row('mine-blocked', 'me', 'kling'),
      row('theirs', 'other', 'seedance'),
    ]);
    service = new OrgGalleryService(
      { findMany, count: jest.fn().mockResolvedValue(3) } as never,
      { findOne: jest.fn(async () => (role ? { role } : null)) } as never,
      { findMany: jest.fn().mockResolvedValue([{ modelType: 'seedance' }]) } as never,
      {
        resolveOutputUrl: jest.fn(async (_o, _p, _t, name: string) => `https://signed/${name}`),
        toThumbnailUrl: jest.fn(),
      } as never,
    );
  });

  const where = () => findMany.mock.calls[0][0].where;

  it('rejects users outside the org', async () => {
    role = null;
    await expect(service.findByOrg('o1', 'me', {})).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('says why each item can or cannot be published', async () => {
    const { data } = await service.findByOrg('o1', 'me', {});
    expect(data.map((d) => [d.id, d.publishBlock])).toEqual([
      ['mine-ok', null],
      ['mine-blocked', 'MODEL_NOT_ALLOWED'],
      ['theirs', 'NOT_OWNER'],
    ]);
    expect(data[0]).toMatchObject({
      type: 'video',
      durationSec: 5,
      mediaUrl: 'https://signed/mine-ok.mp4',
      thumbnailUrl: 'https://signed/mine-ok.jpg',
    });
  });

  it('limits a MEMBER to their own work even when asking for another member', async () => {
    role = 'MEMBER';
    await service.findByOrg('o1', 'me', { memberId: 'other' });
    expect(where().userId).toBe('me');
  });

  it('lets an ADMIN filter by member and by never-published', async () => {
    role = 'ADMIN';
    await service.findByOrg('o1', 'me', { memberId: 'other', publishStatus: 'NONE' });
    expect(where()).toMatchObject({
      project: { organizationId: 'o1' },
      userId: 'other',
      publication: { is: null },
    });
  });
});
