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
  let count: jest.Mock;
  let role: string | null;
  let service: OrgGalleryService;

  beforeEach(() => {
    role = 'OWNER';
    findMany = jest.fn().mockResolvedValue([
      row('mine-ok', 'me', 'seedance'),
      row('mine-blocked', 'me', 'kling'),
      row('theirs', 'other', 'seedance'),
    ]);
    count = jest.fn().mockResolvedValue(3);
    service = new OrgGalleryService(
      { findMany, count } as never,
      { findOne: jest.fn(async () => (role ? { role } : null)) } as never,
      { findMany: jest.fn().mockResolvedValue([{ modelType: 'seedance' }]) } as never,
      {
        resolveOutputUrl: jest.fn(async (_o, _p, _t, name: string) => `https://signed/${name}`),
        toThumbnailUrl: jest.fn(),
      } as never,
    );
  });

  const where = () => findMany.mock.calls[0][0].where;
  const me = { userId: 'me', token: 'sub-me', role: 'USER' };

  it('rejects users outside the org', async () => {
    role = null;
    await expect(service.findByOrg('o1', me, {})).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('lets an OWNER publish anyone in the org on allowed models', async () => {
    const { data } = await service.findByOrg('o1', me, {});
    expect(data.map((d) => [d.id, d.publishBlock])).toEqual([
      ['mine-ok', null],
      ['mine-blocked', 'MODEL_NOT_ALLOWED'],
      ['theirs', null],
    ]);
    expect(data[0]).toMatchObject({
      type: 'video',
      durationSec: 5,
      mediaUrl: 'https://signed/mine-ok.mp4',
      thumbnailUrl: 'https://signed/mine-ok.jpg',
    });
  });

  it('limits a MEMBER to their own work and does not let them publish it', async () => {
    role = 'MEMBER';
    const { data } = await service.findByOrg('o1', me, { memberId: 'other' });
    expect(where().userId).toBe('me');
    expect(data[0].publishBlock).toBe('ROLE_NOT_ALLOWED');
  });

  it('shows a SUPER_ADMIN the whole org without a membership', async () => {
    role = null;
    const { data } = await service.findByOrg('o1', { ...me, role: 'SUPER_ADMIN' }, {});
    expect(where().userId).toBeUndefined();
    expect(data.map((d) => d.publishBlock)).toEqual([null, 'MODEL_NOT_ALLOWED', null]);
  });

  it('lets an ADMIN filter by member and by never-published', async () => {
    role = 'ADMIN';
    await service.findByOrg('o1', me, { memberId: 'other', publishStatus: 'NONE' });
    expect(where()).toEqual({
      AND: [
        expect.objectContaining({ project: { organizationId: 'o1' }, userId: 'other' }),
        { publication: { is: null } },
      ],
    });
  });

  it('treats never-sent, pending, failed and removed work as unpublished', async () => {
    await service.findByOrg('o1', me, { publishStatus: 'UNPUBLISHED' });
    expect(where().AND[1]).toEqual({
      OR: [{ publication: { is: null } }, { publication: { is: { status: { not: 'PUBLISHED' } } } }],
    });
  });

  it('counts all / published / unpublished ignoring the status filter', async () => {
    count.mockResolvedValueOnce(4).mockResolvedValueOnce(10).mockResolvedValueOnce(4);
    const result = await service.findByOrg('o1', me, { publishStatus: 'PUBLISHED' });
    expect(result.total).toBe(4);
    expect(result.counts).toEqual({ all: 10, published: 4, unpublished: 6 });
    expect(count.mock.calls[1][0].where).not.toHaveProperty('AND');
  });
});
