import axios from 'axios';
import { VideoProcessor } from './video.service';

jest.mock('ioredis', () => ({
  Redis: jest.fn().mockImplementation(() => ({ publish: jest.fn() })),
}));
jest.mock('axios');
jest.mock(
  'src/configs',
  () => ({ tosConfigs: () => ({ tosBucket: 'bucket' }) }),
  {
    virtual: true,
  },
);

const axiosGet = axios.get as jest.Mock;
const axiosPost = axios.post as jest.Mock;

/** in-memory Redis พอสำหรับ get/set(EX/NX)/del/exists */
const makeRedis = () => {
  const store = new Map<string, string>();
  return {
    store,
    get: jest.fn(async (k: string) => store.get(k) ?? null),
    set: jest.fn(async (k: string, v: string, ...args: unknown[]) => {
      if (args.includes('NX') && store.has(k)) return null;
      store.set(k, v);
      return 'OK';
    }),
    del: jest.fn(async (k: string) => (store.delete(k) ? 1 : 0)),
    exists: jest.fn(async (k: string) => (store.has(k) ? 1 : 0)),
  };
};

const body = {
  organizationId: 'org',
  projectId: 'proj',
  model: 'seedance-1-5-pro',
  duration: 5,
};

describe('VideoProcessor (callback + poll-check)', () => {
  let redis: ReturnType<typeof makeRedis>;
  let queue: { add: jest.Mock };
  let helper: Record<string, jest.Mock>;
  let gallery: { updateMany: jest.Mock };
  let logs: { findOne: jest.Mock; updateMany: jest.Mock };
  let videoStorage: { storeVideoWithThumbnail: jest.Mock };
  let processor: VideoProcessor;

  const ctx = {
    taskId: 't1',
    clientId: 'c1',
    body,
    userId: 'u1',
    statusBaseUrl: 'https://gw/tasks',
    authToken: 'key',
    videoTaskId: 'cgt-1',
    submittedAt: Date.now(),
  };
  const seedCtx = (overrides: Partial<typeof ctx> = {}) =>
    redis.store.set('video-ctx:t1', JSON.stringify({ ...ctx, ...overrides }));
  const succeeded = {
    data: {
      id: 'cgt-1',
      status: 'succeeded',
      content: { video_url: 'https://ark/v.mp4' },
      usage: { total_tokens: 100 },
    },
  };

  beforeEach(() => {
    redis = makeRedis();
    queue = { add: jest.fn() };
    helper = {
      logAudit: jest.fn(),
      getUsedCredit: jest.fn().mockResolvedValue({ credit: 5 }),
      updateUsedCreditSuccess: jest
        .fn()
        .mockResolvedValue({ usedCreditAllowance: 5, holdCreditAllowance: 0 }),
      updateUsedCreditFail: jest
        .fn()
        .mockResolvedValue({ usedCreditAllowance: 0, holdCreditAllowance: 0 }),
    };
    gallery = { updateMany: jest.fn() };
    logs = {
      findOne: jest.fn().mockResolvedValue({ usedCredit: 5 }),
      updateMany: jest.fn(),
    };
    videoStorage = {
      storeVideoWithThumbnail: jest
        .fn()
        .mockResolvedValue({ file: 'v.mp4', thumbnail: 'thumb.png' }),
    };
    axiosGet.mockReset();
    axiosPost.mockReset();
    processor = new VideoProcessor(
      redis as never,
      gallery as never,
      logs as never,
      {} as never,
      {} as never,
      { resolveOutputUrl: jest.fn().mockResolvedValue('https://get') } as never,
      videoStorage as never,
      helper as never,
      { findOne: jest.fn().mockResolvedValue({}) } as never,
      queue as never,
    );
  });

  afterEach(() => {
    delete process.env.BYTEPLUS_CALLBACK_SECRET;
    delete process.env.BYTEPLUS_CALLBACK_BASE_URL;
  });

  it('submit: sends callback_url, stores ctx, frees the slot and schedules a poll-check', async () => {
    process.env.BYTEPLUS_CALLBACK_SECRET = 's';
    process.env.BYTEPLUS_CALLBACK_BASE_URL = 'https://core/api';
    axiosPost.mockResolvedValue({ data: { id: 'cgt-1' } });
    const job = {
      name: 'vdo-generate-queue',
      id: '1',
      data: {
        taskId: 't1',
        clientId: 'c1',
        userId: 'u1',
        statusBaseUrl: 'https://gw/tasks',
        sendApi: 'https://gw/create',
        sendConfig: {
          type: 'seedance1',
          configType: 'application/json',
          authorization: 'key',
        },
        body: {
          ...body,
          prompt: 'p',
          ratio: '1:1',
          resolution: '720p',
          image: [],
          files: [],
        },
      },
      updateData: jest.fn(),
    };
    const res = await processor.process(job);
    expect(res).toMatchObject({ submitted: true, videoTaskId: 'cgt-1' });
    expect(axiosPost.mock.calls[0][1].callback_url).toMatch(
      /^https:\/\/core\/api\/webhooks\/byteplus\/video\/t1\?sig=[0-9a-f]{64}$/,
    );
    expect(JSON.parse(redis.store.get('video-ctx:t1')!)).toMatchObject({
      videoTaskId: 'cgt-1',
      authToken: 'key',
    });
    expect(queue.add).toHaveBeenCalledWith(
      'video-poll-check',
      { taskId: 't1' },
      expect.objectContaining({ delay: 120000 }),
    );
    expect(axiosGet).not.toHaveBeenCalled();
  });

  it('finalize (callback) completes once even when poll-check also finishes it', async () => {
    seedCtx();
    axiosGet.mockResolvedValue(succeeded);
    await processor.process({ name: 'video-finalize', data: { taskId: 't1' } });
    // ctx is gone after finalize; a racing poll-check must not run the success path again
    seedCtx();
    await processor.process({
      name: 'video-poll-check',
      data: { taskId: 't1' },
    });
    expect(videoStorage.storeVideoWithThumbnail).toHaveBeenCalledTimes(1);
    expect(helper.updateUsedCreditSuccess).toHaveBeenCalledTimes(1);
    expect(gallery.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ genneratedStatus: 'SUCCESS' }),
      }),
    );
  });

  it('provider failed → fail path (refund + FAILED), never reports success', async () => {
    seedCtx();
    axiosGet.mockResolvedValue({ data: { status: 'failed' } });
    await processor.process({ name: 'video-finalize', data: { taskId: 't1' } });
    expect(helper.updateUsedCreditFail).toHaveBeenCalledTimes(1);
    expect(helper.updateUsedCreditSuccess).not.toHaveBeenCalled();
    expect(gallery.updateMany).toHaveBeenCalledWith({
      where: { taskId: 't1' },
      data: { genneratedStatus: 'FAILED' },
    });
  });

  it('finalize before ctx exists throws so BullMQ retries', async () => {
    await expect(
      processor.process({ name: 'video-finalize', data: { taskId: 't1' } }),
    ).rejects.toThrow('not found yet');
  });

  it('finalize when the provider is not terminal yet leaves the task to poll-check', async () => {
    seedCtx();
    axiosGet.mockResolvedValue({ data: { status: 'running' } });
    const res = await processor.process({
      name: 'video-finalize',
      data: { taskId: 't1' },
    });
    expect(res).toEqual({ pending: 'running' });
    expect(redis.store.has('video-final:t1')).toBe(false);
  });

  it('poll-check still running → reschedules', async () => {
    seedCtx();
    axiosGet.mockResolvedValue({ data: { status: 'running' } });
    await processor.process({
      name: 'video-poll-check',
      data: { taskId: 't1' },
    });
    expect(queue.add).toHaveBeenCalledWith(
      'video-poll-check',
      { taskId: 't1' },
      expect.objectContaining({ delay: 120000 }),
    );
  });

  it('poll-check past 20 minutes → fails and refunds once', async () => {
    seedCtx({ submittedAt: Date.now() - 21 * 60 * 1000 });
    await processor.process({
      name: 'video-poll-check',
      data: { taskId: 't1' },
    });
    expect(helper.updateUsedCreditFail).toHaveBeenCalledTimes(1);
    expect(axiosGet).not.toHaveBeenCalled();
  });

  it('poll-check with a transient status error retries instead of failing', async () => {
    seedCtx();
    axiosGet.mockRejectedValue(new Error('ECONNRESET'));
    await processor.process({
      name: 'video-poll-check',
      data: { taskId: 't1' },
    });
    expect(helper.updateUsedCreditFail).not.toHaveBeenCalled();
    expect(queue.add).toHaveBeenCalledTimes(1);
  });

  it('storage failure after the lock → task is closed as failed, not left processing', async () => {
    seedCtx();
    axiosGet.mockResolvedValue(succeeded);
    videoStorage.storeVideoWithThumbnail.mockRejectedValue(
      new Error('tos down'),
    );
    await processor.process({ name: 'video-finalize', data: { taskId: 't1' } });
    expect(helper.updateUsedCreditFail).toHaveBeenCalledTimes(1);
    expect(redis.store.has('video-ctx:t1')).toBe(false);
  });
});
