import { ConflictException } from '@nestjs/common';
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
  users: { token: `sub-${userId}`, fullname: userId },
});

describe('CommunityPublicationService', () => {
  let publications: ReturnType<typeof fakePublications>;
  let copyObject: jest.Mock;
  let upsertItem: jest.Mock;
  let service: CommunityPublicationService;
  const me = { userId: 'me', token: 'sub-me', role: 'USER' };

  beforeEach(() => {
    publications = fakePublications();
    copyObject = jest.fn().mockResolvedValue({ ok: true });
    upsertItem = jest.fn().mockResolvedValue('foundise-1');
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
      {} as never,
      {
        publishBlocks: jest.fn(
          async () =>
            new Map([
              ['mine', null],
              ['blocked', 'MODEL_NOT_ALLOWED'],
              ['theirs', 'NOT_OWNER'],
            ]),
        ),
      } as never,
      {} as never,
      { copyObject, deleteObject: jest.fn() } as never,
      { upsertItem, deleteItem: jest.fn() } as never,
      { publicApiBaseUrl: 'https://api.aicave.ai/', foundiseApiBaseUrl: '', foundiseApiKey: '' },
    );
  });

  const publish = (galleryIds: string[]) =>
    service.publish(me, {
      organizationId: 'o1',
      galleryIds,
      visibility: 'PUBLIC',
      includePrompt: false,
    });

  it('publishes only my work on allowed models and says why the rest were skipped', async () => {
    const results = await publish(['mine', 'blocked', 'theirs', 'ghost']);
    expect(results).toEqual([
      { galleryId: 'mine', publicationId: 'pub-1', status: 'PENDING' },
      { galleryId: 'blocked', status: 'SKIPPED', reason: 'MODEL_NOT_ALLOWED' },
      { galleryId: 'theirs', status: 'SKIPPED', reason: 'NOT_OWNER' },
      { galleryId: 'ghost', status: 'SKIPPED', reason: 'NOT_FOUND' },
    ]);
  });

  it('copies the files to a separate preview prefix and sends stable public URLs', async () => {
    await publish(['mine']);
    expect(copyObject.mock.calls.map((c) => [c[1], c[2]])).toEqual([
      ['organize/o1/p1/video-generate/mine.mp4', 'organize/o1/community-publication/pub-1/0.mp4'],
      ['organize/o1/p1/video-generate/mine.jpg', 'organize/o1/community-publication/pub-1/thumbnail.jpg'],
    ]);
    expect(upsertItem.mock.calls[0][0]).toMatchObject({
      aicavePublicationId: 'pub-1',
      creator: { keycloakSub: 'sub-me', fullname: 'me' },
      prompt: null,
      media: [
        {
          type: 'video',
          url: 'https://api.aicave.ai/public/community-publication/pub-1/media/0',
          thumbnailUrl: 'https://api.aicave.ai/public/community-publication/pub-1/media/0?thumbnail=1',
        },
      ],
    });
    expect(publications.rows.get('pub-1')?.communityItemId).toBe('foundise-1');
  });

  it('publishing the same work twice keeps one publication', async () => {
    await publish(['mine']);
    await publish(['mine']);
    expect(publications.rows.size).toBe(1);
  });

  it('marks the publication FAILED with the reason when Community is unreachable', async () => {
    upsertItem.mockRejectedValue(new Error('connect ECONNREFUSED'));
    const [result] = await publish(['mine']);
    expect(result).toEqual({
      galleryId: 'mine',
      publicationId: 'pub-1',
      status: 'FAILED',
      error: 'connect ECONNREFUSED',
    });
    expect(publications.rows.get('pub-1')).toMatchObject({ status: 'FAILED', error: 'connect ECONNREFUSED' });
  });

  it('marks FAILED when a file copy fails instead of sending a broken link', async () => {
    copyObject.mockResolvedValue(undefined);
    const [result] = await publish(['mine']);
    expect(result).toMatchObject({ status: 'FAILED' });
    expect(upsertItem).not.toHaveBeenCalled();
  });

  describe('webhook', () => {
    beforeEach(() => publish(['mine']));

    it('APPROVED makes it PUBLISHED, and a repeat is harmless', async () => {
      const event = { aicavePublicationId: 'pub-1', event: 'APPROVED' as const };
      await expect(service.applyWebhook(event)).resolves.toEqual({ status: 'PUBLISHED' });
      await expect(service.applyWebhook(event)).resolves.toEqual({ status: 'PUBLISHED' });
    });

    it('a late APPROVED does not bring back removed work', async () => {
      await service.applyWebhook({ aicavePublicationId: 'pub-1', event: 'REMOVED' });
      await expect(
        service.applyWebhook({ aicavePublicationId: 'pub-1', event: 'APPROVED' }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(publications.rows.get('pub-1')?.status).toBe('REMOVED');
    });

    it('REJECTED keeps the reason for the creator', async () => {
      await service.applyWebhook({ aicavePublicationId: 'pub-1', event: 'REJECTED', reason: 'nsfw' });
      expect(publications.rows.get('pub-1')).toMatchObject({ status: 'REJECTED', error: 'nsfw' });
    });
  });
  describe('listPublic', () => {
    const feedRow = (id: string, extra: Record<string, unknown> = {}) => ({
      id,
      organizationId: 'o1',
      includePrompt: false,
      previewItems: [{ key: 'k0', thumbnailKey: null, typeGenerate: 'image', order: 0 }],
      publishedAt: new Date('2026-11-01T00:00:00Z'),
      updatedAt: new Date('2026-11-02T00:00:00Z'),
      gallery: { prompt: 'a cat', generateConfig: { modelName: 'seedream' } },
      ...extra,
    });

    it('asks only for PUBLISHED + PUBLIC work and returns stable links', async () => {
      publications.findMany.mockResolvedValue([feedRow('pub-9', { includePrompt: true })]);
      const result = await service.listPublic({ updatedSince: '2026-11-01T00:00:00Z' });

      expect(publications.findMany.mock.calls[0][0]).toMatchObject({
        where: {
          status: 'PUBLISHED',
          visibility: 'PUBLIC',
          updatedAt: { gte: new Date('2026-11-01T00:00:00Z') },
        },
        take: 51,
      });
      expect(result).toEqual({
        items: [
          {
            id: 'pub-9',
            organizationId: 'o1',
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
            publishedAt: new Date('2026-11-01T00:00:00Z'),
            updatedAt: new Date('2026-11-02T00:00:00Z'),
          },
        ],
        nextCursor: null,
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

    it('returns a cursor when there is another page and resumes after it', async () => {
      publications.findMany.mockResolvedValue([feedRow('a'), feedRow('b'), feedRow('c')]);
      const first = await service.listPublic({ limit: 2 });
      expect(first.items.map((i) => i.id)).toEqual(['a', 'b']);
      expect(first.nextCursor).toBe('b');

      await service.listPublic({ limit: 2, cursor: 'b' });
      expect(publications.findMany.mock.calls[1][0]).toMatchObject({ cursor: { id: 'b' }, skip: 1, take: 3 });
    });
  });
});
