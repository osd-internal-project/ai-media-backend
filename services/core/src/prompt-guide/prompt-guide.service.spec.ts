import { PromptGuideService } from './prompt-guide.service';

type Row = {
  uid: string;
  imageName: string;
  imagePath: string;
  status: string;
  index: number;
  promptGuideId: number;
};

const row = (uid: string, index: number): Row => ({
  uid,
  imageName: `${uid}.png`,
  imagePath: `organize/o/prompt-guide/${uid}.png`,
  status: 'completed',
  index,
  promptGuideId: 7,
});

const guide = {
  id: 7,
  title: 'Opening shot',
  model: null,
  generateType: 'video',
  organizationId: 'org-1',
  promptGuideImages: ['ref-1', 'ref-2'],
  promptGuideResults: ['res-1'],
};

const setup = (rows: Row[] = [row('ref-1', 1), row('ref-2', 2), row('res-1', 3)]) => {
  const promptguideRepo = {
    findMany: jest.fn().mockResolvedValue([guide]),
    findOne: jest.fn().mockResolvedValue(guide),
    update: jest.fn(async ({ data }) => ({ ...guide, ...data })),
  };
  // จำลอง where ของ Prisma ที่ service ใช้: uid in / notIn, promptGuideId
  const promptGuideImageRepo = {
    findMany: jest.fn(async ({ where }) =>
      rows
        .filter((r) => !where.uid?.in || where.uid.in.includes(r.uid))
        .filter((r) => !where.uid?.notIn || !where.uid.notIn.includes(r.uid))
        .filter((r) => where.promptGuideId === undefined || r.promptGuideId === where.promptGuideId)
        .sort((a, b) => a.index - b.index),
    ),
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
  };
  const storageUrl = {
    toDisplayUrl: jest.fn(async (key: string) => `https://cdn/${key}`),
  };
  const service = new PromptGuideService(
    promptguideRepo as never,
    promptGuideImageRepo as never,
    storageUrl as never,
  );
  return { service, promptguideRepo, promptGuideImageRepo };
};

describe('PromptGuideService', () => {
  it('findByOrganization returns references in images and showcase media in results', async () => {
    const { service } = setup();

    const [result] = await service.findByOrganization('org-1');

    expect(result.images.map((m) => m.uid)).toEqual(['ref-1', 'ref-2']);
    expect(result.results).toEqual([
      {
        uid: 'res-1',
        name: 'res-1.png',
        url: 'https://cdn/organize/o/prompt-guide/res-1.png',
        imagePath: 'organize/o/prompt-guide/res-1.png',
        status: 'completed',
        index: 3,
      },
    ]);
  });

  it('findByOrganization with a model also includes guides not bound to a model', async () => {
    const { service, promptguideRepo } = setup();

    await service.findByOrganization('org-1', { model: 'seedance-2-0' });

    expect(promptguideRepo.findMany.mock.calls[0][0].where).toEqual({
      organizationId: 'org-1',
      OR: [{ model: 'seedance-2-0' }, { model: null }, { model: '' }],
    });
  });

  it('findByOrganization without a model does not filter by model', async () => {
    const { service, promptguideRepo } = setup();

    await service.findByOrganization('org-1', {});

    expect(promptguideRepo.findMany.mock.calls[0][0].where).toEqual({
      organizationId: 'org-1',
    });
  });

  it('getPromptGuideImages leaves out result media', async () => {
    const { service } = setup();

    const images = await service.getPromptGuideImages(7);

    expect(images.map((m) => m.uid)).toEqual(['ref-1', 'ref-2']);
  });

  it('getPromptGuideResults returns only result media', async () => {
    const { service } = setup();

    const results = await service.getPromptGuideResults(7);

    expect(results.map((m) => m.uid)).toEqual(['res-1']);
  });

  it('update re-numbers references and results 1..n in list order', async () => {
    const { service, promptGuideImageRepo } = setup();

    await service.update(7, {
      promptGuideImages: ['ref-3', 'ref-1'],
      promptGuideResults: ['res-1'],
    });

    const writes = promptGuideImageRepo.updateMany.mock.calls.map(([arg]) => [
      arg.where.uid,
      arg.data,
    ]);
    expect(writes).toEqual(
      expect.arrayContaining([
        ['ref-3', { status: 'completed', index: 1 }],
        ['ref-1', { status: 'completed', index: 2 }],
        ['res-1', { status: 'completed', index: 1 }],
      ]),
    );
    expect(writes).toHaveLength(3);
  });

  it('update keeps fixed first/last slots for dreamactor references', async () => {
    const { service, promptguideRepo, promptGuideImageRepo } = setup();
    promptguideRepo.update.mockResolvedValueOnce({ ...guide, generateType: 'dreamactor' });

    await service.update(7, { promptGuideImages: ['last', 'first'] });

    expect(promptGuideImageRepo.updateMany.mock.calls.map(([arg]) => arg.data)).toEqual([
      { status: 'completed' },
      { status: 'completed' },
    ]);
  });
});
