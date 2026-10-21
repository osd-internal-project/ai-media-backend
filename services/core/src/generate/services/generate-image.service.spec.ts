import { GenerateImageService } from './generate-image.service';

const makeBuild = () => {
  const helper = { buildGenerateConfig: jest.fn(() => ({ content: 'p' })) };
  const service = new GenerateImageService(
    helper as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
  // buildGalleryData เป็น protected hook — เรียกตรงเพื่อทดสอบแยกจาก flow ทั้งก้อน
  return (
    service as unknown as {
      buildGalleryData: (...args: unknown[]) => Record<string, unknown>;
    }
  ).buildGalleryData.bind(service);
};

const body = {
  projectId: 'proj',
  prompt: 'p',
  model: 'm',
  ratio: '1:1',
  resolution: '2k',
  width: 2048,
  height: 2048,
  maxImages: 2,
  image: ['ref.png'],
};

describe('GenerateImageService.buildGalleryData', () => {
  it('creates a PENDING row so a refresh mid-generation still shows the task', () => {
    const row = makeBuild()('t1', body, { userId: 'u1' }, { incrementCredit: 7 });
    expect(row).toMatchObject({
      taskId: 't1',
      projectId: 'proj',
      userId: 'u1',
      typeGenerate: 'image',
      genneratedStatus: 'PENDING',
      resultUrl: [],
      usedCredit: 7,
      referenceImages: ['ref.png'],
    });
  });

  it('stores an empty reference list when no image is attached', () => {
    const row = makeBuild()(
      't1',
      { ...body, image: [] },
      { userId: 'u1' },
      { incrementCredit: 0 },
    );
    expect(row.referenceImages).toEqual([]);
  });
});
