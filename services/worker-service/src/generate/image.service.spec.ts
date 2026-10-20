import axios from 'axios';
import { IMAGE_JOB_SWEEP } from '@ai-media/share';
import { ImageProcessor } from './image.service';

jest.mock('ioredis', () => {
  const RedisMock = jest
    .fn()
    .mockImplementation(() => ({ publish: jest.fn() }));
  return { __esModule: true, default: RedisMock, Redis: RedisMock };
});
jest.mock(
  'src/configs',
  () => ({ tosConfigs: () => ({ tosBucket: 'bucket' }) }),
  { virtual: true },
);

type Private = {
  saveGallery: (data: Record<string, unknown>) => Promise<string | undefined>;
  publishToCore: jest.Mock;
  updateTaskStatus: jest.Mock;
};

describe('ImageProcessor gallery + sweeper', () => {
  let gallery: {
    updateMany: jest.Mock;
    create: jest.Mock;
    findMany: jest.Mock;
    findOne: jest.Mock;
  };
  let queue: { getJob: jest.Mock; upsertJobScheduler: jest.Mock };
  let helper: { updateUsedCreditFail: jest.Mock };
  let processor: ImageProcessor;
  let priv: Private;

  const staleRow = {
    taskId: 't1',
    userId: 'u1',
    projectId: 'proj',
    usedCredit: 7,
  };
  const jobInState = (state: string) => ({
    data: { clientId: 'c1' },
    getState: jest.fn().mockResolvedValue(state),
  });

  beforeEach(() => {
    gallery = {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      create: jest.fn().mockResolvedValue({ id: 'g-new' }),
      findMany: jest.fn().mockResolvedValue([staleRow]),
      findOne: jest.fn().mockResolvedValue({ id: 'g1' }),
    };
    queue = { getJob: jest.fn(), upsertJobScheduler: jest.fn() };
    helper = { updateUsedCreditFail: jest.fn().mockResolvedValue({}) };
    processor = new ImageProcessor(
      { get: jest.fn().mockResolvedValue(null) } as never,
      gallery as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      helper as never,
      {} as never,
      queue as never,
    );
    // helper ภายในเป็น private — เข้าถึงตรงเพื่อทดสอบแยกจาก flow generate ทั้งก้อน
    priv = processor as unknown as Private;
    priv.publishToCore = jest.fn();
    priv.updateTaskStatus = jest.fn();
  });

  describe('saveGallery', () => {
    const data = { taskId: 't1', genneratedStatus: 'SUCCESS' };

    it('updates the PENDING row core created at submit', async () => {
      await expect(priv.saveGallery(data)).resolves.toBe('g1');
      expect(gallery.updateMany).toHaveBeenCalledWith({
        where: { taskId: 't1' },
        data,
      });
      expect(gallery.create).not.toHaveBeenCalled();
    });

    it('creates the row when none exists (job queued before the deploy)', async () => {
      gallery.updateMany.mockResolvedValue({ count: 0 });
      await expect(priv.saveGallery(data)).resolves.toBe('g-new');
      expect(gallery.create).toHaveBeenCalledWith({ data });
    });
  });

  describe('sweep', () => {
    const sweep = () => processor.process({ name: IMAGE_JOB_SWEEP });

    it('leaves rows whose job is still queued or running', async () => {
      queue.getJob.mockResolvedValue(jobInState('active'));
      await expect(sweep()).resolves.toMatchObject({ alive: 1 });
      expect(gallery.updateMany).not.toHaveBeenCalled();
      expect(helper.updateUsedCreditFail).not.toHaveBeenCalled();
    });

    it('fails a stale row once: FAILED, refunds the hold, notifies the user', async () => {
      queue.getJob.mockResolvedValue(jobInState('failed'));
      await expect(sweep()).resolves.toMatchObject({ failed: 1 });
      expect(gallery.updateMany).toHaveBeenCalledWith({
        where: { taskId: 't1', genneratedStatus: 'PENDING' },
        data: { genneratedStatus: 'FAILED' },
      });
      expect(helper.updateUsedCreditFail).toHaveBeenCalledTimes(1);
      expect(helper.updateUsedCreditFail).toHaveBeenCalledWith(
        'u1',
        '',
        'proj',
        'credit',
        7,
      );
      expect(priv.publishToCore).toHaveBeenCalledWith(
        'c1',
        'worker:image-error',
        expect.objectContaining({ taskId: 't1', type: 'image' }),
      );
    });

    it('fails a row whose job is gone from the queue', async () => {
      queue.getJob.mockResolvedValue(undefined);
      await expect(sweep()).resolves.toMatchObject({ failed: 1 });
      expect(priv.publishToCore).toHaveBeenCalledWith(
        '',
        'worker:image-error',
        expect.anything(),
      );
    });

    it('does not refund when another path already closed the row', async () => {
      queue.getJob.mockResolvedValue(jobInState('failed'));
      gallery.updateMany.mockResolvedValue({ count: 0 });
      await expect(sweep()).resolves.toMatchObject({ cleared: 1 });
      expect(helper.updateUsedCreditFail).not.toHaveBeenCalled();
      expect(priv.publishToCore).not.toHaveBeenCalled();
    });

    it('keeps sweeping other rows when one throws', async () => {
      gallery.findMany.mockResolvedValue([
        staleRow,
        { ...staleRow, taskId: 't2' },
      ]);
      queue.getJob
        .mockRejectedValueOnce(new Error('redis down'))
        .mockResolvedValueOnce(jobInState('failed'));
      await expect(sweep()).resolves.toMatchObject({ error: 1, failed: 1 });
    });
  });
});

describe('ImageProcessor seedream2 payload', () => {
  type Builder = {
    buildPayload: (
      body: Record<string, unknown>,
      sendConfig: Record<string, unknown>,
    ) => Promise<Record<string, unknown>>;
  };
  let storageUrl: { toProviderUrls: jest.Mock };
  let builder: Builder;

  const body = {
    model: 'dola-seedream-5-0-pro-260628',
    prompt: 'a cat',
    width: 2048,
    height: 2048,
    ratio: '1:1',
    maxImages: 1,
    sequentialImageGeneration: 'disabled',
    image: [] as string[],
  };

  beforeEach(() => {
    storageUrl = {
      toProviderUrls: jest
        .fn()
        .mockImplementation(async (keys: string[]) =>
          keys.map((k) => `https://signed/${k}`),
        ),
    };
    const processor = new ImageProcessor(
      { get: jest.fn() } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      storageUrl as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { upsertJobScheduler: jest.fn() } as never,
    );
    builder = processor as unknown as Builder;
  });

  it('omits fields Seedream 5.0 Pro rejects with HTTP 400', async () => {
    const payload = await builder.buildPayload(body, { type: 'seedream2' });
    expect(payload).toEqual({
      model: body.model,
      prompt: 'a cat',
      response_format: 'url',
      size: '2048x2048',
      watermark: false,
    });
  });

  it('reads watermark from sendConfig', async () => {
    const payload = await builder.buildPayload(body, {
      type: 'seedream2',
      watermark: true,
    });
    expect(payload.watermark).toBe(true);
  });

  it('keeps at most 10 reference images', async () => {
    const refs = Array.from({ length: 12 }, (_, i) => `key-${i}`);
    const payload = await builder.buildPayload(
      { ...body, image: [...refs, ''] },
      { type: 'seedream2' },
    );
    expect(storageUrl.toProviderUrls).toHaveBeenCalledWith(refs.slice(0, 10));
    expect(payload.image).toHaveLength(10);
  });
});

describe('ImageProcessor stage events', () => {
  it('tells the front the task left the queue before the sync provider call', async () => {
    const post = jest
      .spyOn(axios, 'post')
      .mockRejectedValue({ response: { status: 400, data: {} } });
    const processor = new ImageProcessor(
      { get: jest.fn() } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { getUsedCredit: jest.fn().mockResolvedValue(0) } as never,
      { findOne: jest.fn().mockResolvedValue({}) } as never,
      { upsertJobScheduler: jest.fn() } as never,
    );
    const priv = processor as unknown as Private & { buildPayload: jest.Mock };
    priv.publishToCore = jest.fn();
    priv.updateTaskStatus = jest.fn();
    priv.buildPayload = jest.fn().mockResolvedValue({});

    await processor
      .process({
        id: '1',
        name: 'image',
        data: {
          taskId: 't1',
          clientId: 'c1',
          userId: 'u1',
          sendApi: 'https://gw/img',
          sendConfig: { configType: 'application/json' },
          body: { projectId: 'p1', organizationId: 'o1', model: 'm' },
        },
      })
      .catch(() => undefined);

    const generating = priv.publishToCore.mock.calls.findIndex(
      ([, event, payload]) =>
        event === 'worker:progress' && payload.stage === 'generating',
    );
    expect(generating).toBeGreaterThanOrEqual(0);
    expect(priv.publishToCore.mock.calls[generating][2]).toMatchObject({
      taskId: 't1',
      projectId: 'p1',
      type: 'image',
    });
    expect(
      priv.publishToCore.mock.invocationCallOrder[generating],
    ).toBeLessThan(post.mock.invocationCallOrder[0]);
    post.mockRestore();
  });
});
