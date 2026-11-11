import { CommunityPublicationService } from './community-publication.service';

type Row = {
  id: string;
  galleryId: string;
  status: string;
  error: string | null;
  previewItems: unknown;
  [k: string]: unknown;
};

/** community_publication ในหน่วยความจำ — พอให้ทดสอบ upsert / updateMany ตามสถานะได้จริง */
const fakePublications = () => {
  const rows = new Map<string, Row>();
  let seq = 0;
  return {
    rows,
    upsert: jest.fn(async ({ where, create, update }) => {
      const found = [...rows.values()].find((r) => r.galleryId === where.galleryId);
      if (found) return Object.assign(found, update);
      const row = { id: `pub-${++seq}`, status: 'PENDING', error: null, previewItems: [], ...create };
      rows.set(row.id, row);
      return row;
    }),
    update: jest.fn(async ({ where, data }) => Object.assign(rows.get(where.id)!, data)),
    updateMany: jest.fn(async ({ where, data }) => {
      const row = rows.get(where.id);
      if (!row || !where.status.in.includes(row.status)) return { count: 0 };
      Object.assign(row, data);
      return { count: 1 };
    }),
    findOne: jest.fn(async ({ where }) => rows.get(where.id) ?? null),
    findMany: jest.fn(),
    count: jest.fn(),
  };
};

const gallery = (id: string, userId: string) => ({
  id,
  userId,
  projectId: 'p1',
  typeGenerate: 'video',
  prompt: 'a cat',
  createdAt: new Date('2026-10-30T00:00:00Z'),
  resultUrl: [`${id}.mp4`],
  imageUrl: null,
  thumbnailUrl: `${id}.jpg`,
  generateConfig: { modelName: 'seedance' },
});

describe('CommunityPublicationService', () => {
  let publications: ReturnType<typeof fakePublications>;
  let copyObject: jest.Mock;
  let orgFindMany: jest.Mock;
  let service: CommunityPublicationService;
  const me = { userId: 'me', token: 'sub-me', role: 'USER' };

  beforeEach(() => {
    publications = fakePublications();
    copyObject = jest.fn().mockResolvedValue({ ok: true });
    orgFindMany = jest.fn().mockResolvedValue([{ organizationId: 'o1', name: 'Studio A' }]);
    service = new CommunityPublicationService(
      publications as never,
      {
        findMany: jest.fn().mockResolvedValue([
          gallery('mine', 'me'),
          gallery('blocked', 'me'),
          gallery('theirs', 'other'),
        ]),
      } as never,
      { findOne: jest.fn().mockResolvedValue({ role: 'MEMBER' }) } as never,
      { findMany: orgFindMany } as never,
      {} as never,
      {
        orgWideOrFail: jest.fn().mockResolvedValue(true),
        publishBlocks: jest.fn(
          async () =>
            new Map([
              ['mine', null],
              ['blocked', 'MODEL_NOT_ALLOWED'],
              ['theirs', 'ROLE_NOT_ALLOWED'],
            ]),
        ),
      } as never,
      {} as never,
      { copyObject, deleteObject: jest.fn() } as never,
      { publicApiBaseUrl: 'https://api.aicave.ai/' },
    );
  });

  const publish = (galleryIds: string[]) =>
    service.publish(me, {
      organizationId: 'o1',
      galleryIds,
      visibility: 'PUBLIC',
      includePrompt: false,
    });

  it('publishes allowed items and says why the rest were skipped', async () => {
    const results = await publish(['mine', 'blocked', 'theirs', 'ghost']);
    expect(results).toEqual([
      { galleryId: 'mine', publicationId: 'pub-1', status: 'PUBLISHED' },
      { galleryId: 'blocked', status: 'SKIPPED', reason: 'MODEL_NOT_ALLOWED' },
      { galleryId: 'theirs', status: 'SKIPPED', reason: 'ROLE_NOT_ALLOWED' },
      { galleryId: 'ghost', status: 'SKIPPED', reason: 'NOT_FOUND' },
    ]);
  });

  it('copies the files to a separate preview prefix and publishes right away', async () => {
    await publish(['mine']);
    expect(copyObject.mock.calls.map((c) => [c[1], c[2]])).toEqual([
      ['organize/o1/p1/video-generate/mine.mp4', 'organize/o1/community-publication/pub-1/0.mp4'],
      ['organize/o1/p1/video-generate/mine.jpg', 'organize/o1/community-publication/pub-1/thumbnail.jpg'],
    ]);
    expect(publications.rows.get('pub-1')).toMatchObject({
      status: 'PUBLISHED',
      publishedAt: expect.any(Date),
      previewItems: [
        {
          key: 'organize/o1/community-publication/pub-1/0.mp4',
          thumbnailKey: 'organize/o1/community-publication/pub-1/thumbnail.jpg',
          typeGenerate: 'video',
          order: 0,
        },
      ],
    });
  });

  it('publishing the same work twice keeps one publication', async () => {
    await publish(['mine']);
    await publish(['mine']);
    expect(publications.rows.size).toBe(1);
  });

  it('marks FAILED when a file copy fails so a broken link never reaches the feed', async () => {
    copyObject.mockResolvedValue(undefined);
    const [result] = await publish(['mine']);
    expect(result).toMatchObject({ status: 'FAILED' });
    expect(publications.rows.get('pub-1')).toMatchObject({ status: 'FAILED', error: expect.stringContaining('copy failed') });
  });

  describe('listPublic', () => {
    const feedRow = (id: string, extra: Record<string, unknown> = {}) => ({
      id,
      organizationId: 'o1',
      includePrompt: false,
      visibility: 'PUBLIC',
      previewItems: [{ key: 'k0', thumbnailKey: null, typeGenerate: 'image', order: 0 }],
      publishedAt: new Date('2026-11-01T00:00:00Z'),
      updatedAt: new Date('2026-11-02T00:00:00Z'),
      gallery: { prompt: 'a cat', generateConfig: { modelName: 'seedream' } },
      ...extra,
    });

    beforeEach(() => publications.count.mockResolvedValue(1));

    it('asks only for PUBLISHED + PUBLIC work and returns stable links with the org name', async () => {
      publications.findMany.mockResolvedValue([feedRow('pub-9', { includePrompt: true })]);
      const result = await service.listPublic({ updatedSince: '2026-11-01T00:00:00Z' });

      const where = {
        status: 'PUBLISHED',
        visibility: 'PUBLIC',
        updatedAt: { gte: new Date('2026-11-01T00:00:00Z') },
      };
      expect(publications.findMany.mock.calls[0][0]).toMatchObject({
        where,
        orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
        take: 50,
        skip: 0,
      });
      expect(publications.count).toHaveBeenCalledWith({ where });
      expect(result).toEqual({
        items: [
          {
            id: 'pub-9',
            organizationId: 'o1',
            organizationName: 'Studio A',
            type: 'image',
            modelName: 'seedream',
            prompt: 'a cat',
            media: [
              {
                type: 'image',
                url: 'https://api.aicave.ai/public/community-publication/pub-9/media/0',
                thumbnailUrl: 'https://api.aicave.ai/public/community-publication/pub-9/media/0?thumbnail=1',
              },
            ],
            visibility: 'PUBLIC',
            publishedAt: new Date('2026-11-01T00:00:00Z'),
            updatedAt: new Date('2026-11-02T00:00:00Z'),
          },
        ],
        total: 1,
        take: 50,
        skip: 0,
      });
    });

    it('hides the prompt unless the creator chose to show it, and survives a deleted gallery', async () => {
      publications.findMany.mockResolvedValue([feedRow('a'), feedRow('b', { gallery: null, includePrompt: true })]);
      const { items } = await service.listPublic({});
      expect(items.map((i) => [i.prompt, i.modelName])).toEqual([
        [null, 'seedream'],
        [null, null],
      ]);
    });

    it('pages with take/skip and filters one organization', async () => {
      publications.findMany.mockResolvedValue([feedRow('c')]);
      publications.count.mockResolvedValue(3);
      const result = await service.listPublic({ organizationId: 'o1', take: 2, skip: 2 });

      expect(publications.findMany.mock.calls[0][0]).toMatchObject({
        where: { organizationId: 'o1' },
        take: 2,
        skip: 2,
      });
      expect(result).toMatchObject({ total: 3, take: 2, skip: 2 });
    });

    it('gives a null org name when the organization is gone, and skips the lookup on an empty page', async () => {
      orgFindMany.mockResolvedValue([]);
      publications.findMany.mockResolvedValue([feedRow('a')]);
      const { items } = await service.listPublic({});
      expect(items[0].organizationName).toBeNull();

      orgFindMany.mockClear();
      publications.findMany.mockResolvedValue([]);
      publications.count.mockResolvedValue(0);
      await expect(service.listPublic({})).resolves.toMatchObject({ items: [], total: 0 });
      expect(orgFindMany).not.toHaveBeenCalled();
    });

    it('searches by type, model and publish date range through the gallery', async () => {
      publications.findMany.mockResolvedValue([]);
      publications.count.mockResolvedValue(0);
      await service.listPublic({
        type: 'image',
        modelName: 'seedream-4-0',
        publishedFrom: '2026-11-01T00:00:00Z',
        publishedTo: '2026-11-30T23:59:59Z',
      });
      expect(publications.findMany.mock.calls[0][0].where).toEqual({
        status: 'PUBLISHED',
        visibility: 'PUBLIC',
        publishedAt: {
          gte: new Date('2026-11-01T00:00:00Z'),
          lte: new Date('2026-11-30T23:59:59Z'),
        },
        gallery: {
          is: {
            typeGenerate: { in: expect.arrayContaining(['image']) },
            generateConfig: { path: ['modelName'], equals: 'seedream-4-0' },
          },
        },
      });
    });

    it("listMine returns only the token user's PUBLISHED work, PUBLIC and PRIVATE alike", async () => {
      publications.findMany.mockResolvedValue([feedRow('a'), feedRow('b', { visibility: 'PRIVATE' })]);
      const { items } = await service.listMine(me, { organizationId: 'o1' });

      const where = { status: 'PUBLISHED', userId: 'me', organizationId: 'o1' };
      expect(publications.findMany.mock.calls[0][0].where).toEqual(where);
      expect(publications.count).toHaveBeenCalledWith({ where });
      expect(items.map((i) => i.visibility)).toEqual(['PUBLIC', 'PRIVATE']);
    });
  });
});
