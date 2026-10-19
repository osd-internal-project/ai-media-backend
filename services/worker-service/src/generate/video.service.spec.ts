import axios from 'axios';
import { VideoProcessor, unwrapProviderMessage } from './video.service';

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

/** in-memory Redis พอสำหรับ get/set(EX/NX)/del/exists + zset/hash ของ inflight */
const makeRedis = () => {
  const store = new Map<string, string>();
  const zset = new Map<string, number>();
  const hash = new Map<string, string>();
  const multi = () => {
    const chain = {
      zrem: (_k: string, m: string) => (zset.delete(m), chain),
      hdel: (_k: string, f: string) => (hash.delete(f), chain),
      exec: async () => [],
    };
    return chain;
  };
  return {
    store,
    zset,
    hash,
    multi: jest.fn(multi),
    zrangebyscore: jest.fn(async (_k: string, _min: string, max: number) =>
      [...zset].filter(([, score]) => score <= max).map(([m]) => m),
    ),
    hget: jest.fn(async (_k: string, f: string) => hash.get(f) ?? null),
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
  let queue: { add: jest.Mock; getJob: jest.Mock };
  let helper: Record<string, jest.Mock>;
  let gallery: { updateMany: jest.Mock };
  let logs: { findOne: jest.Mock; updateMany: jest.Mock };
  let videoStorage: { storeVideoWithThumbnail: jest.Mock };
  let assetSvc: { swapImagesToAssets: jest.Mock; cleanup: jest.Mock };
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
    queue = { add: jest.fn(), getJob: jest.fn().mockResolvedValue(undefined) };
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
    assetSvc = {
      swapImagesToAssets: jest.fn().mockResolvedValue(null),
      cleanup: jest.fn(),
    };
    axiosGet.mockReset();
    axiosPost.mockReset();
    processor = new VideoProcessor(
      redis as never,
      gallery as never,
      logs as never,
      {} as never,
      {} as never,
      {
        resolveOutputUrl: jest.fn().mockResolvedValue('https://get'),
        toProviderUrl: jest.fn(async (v: string) => v),
      } as never,
      videoStorage as never,
      helper as never,
      { findOne: jest.fn().mockResolvedValue({}) } as never,
      queue as never,
      assetSvc as never,
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

  const publishedError = (): { message: string } | undefined => {
    const publish = (processor as any).redisPublisher.publish as jest.Mock;
    const call = publish.mock.calls.find(
      ([, raw]) => JSON.parse(raw).event === 'worker:video-error',
    );
    return call ? JSON.parse(call[1]).payload : undefined;
  };

  it('provider failed with an error message → user gets the provider message', async () => {
    seedCtx();
    axiosGet.mockResolvedValue({
      data: {
        status: 'failed',
        error: {
          code: 'InputImageSensitiveContentDetected',
          message: 'The input image may contain real person.',
        },
      },
    });
    await processor.process({ name: 'video-finalize', data: { taskId: 't1' } });
    expect(publishedError()?.message).toBe(
      'The input image may contain real person.',
    );
  });

  it('provider failed without an error body → falls back to the status', async () => {
    seedCtx();
    axiosGet.mockResolvedValue({ data: { status: 'expired' } });
    await processor.process({ name: 'video-finalize', data: { taskId: 't1' } });
    expect(publishedError()?.message).toBe('provider task expired');
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

  describe('seedance2 assets', () => {
    const assets = { groupId: 'g1', assetIds: ['a1'] };
    const seedance2Job = () => ({
      name: 'vdo-generate-queue',
      id: '1',
      data: {
        taskId: 't1',
        clientId: 'c1',
        userId: 'u1',
        statusBaseUrl: 'https://gw/tasks',
        sendApi: 'https://gw/create',
        sendConfig: {
          type: 'seedance2',
          configType: 'application/json',
          authorization: 'key',
        },
        body: {
          ...body,
          prompt: 'p',
          image: [],
          files: [{ type: 'image', url: 'https://s3/face.png' }],
        },
      },
      updateData: jest.fn(),
    });

    it('submit swaps images to assets before POST and keeps them in ctx + job data', async () => {
      assetSvc.swapImagesToAssets.mockImplementation(async (payload) => {
        payload.content[1].image_url.url = 'asset://a1';
        return assets;
      });
      axiosPost.mockResolvedValue({ data: { id: 'cgt-1' } });
      const job = seedance2Job();
      await processor.process(job);

      expect(axiosPost.mock.calls[0][1].content[1]).toEqual({
        type: 'image_url',
        image_url: { url: 'asset://a1' },
        role: 'reference_image',
      });
      expect(JSON.parse(redis.store.get('video-ctx:t1')!).assets).toEqual(
        assets,
      );
      expect(job.updateData).toHaveBeenCalledWith(
        expect.objectContaining({ videoTaskId: 'cgt-1', assets }),
      );
      expect(assetSvc.cleanup).not.toHaveBeenCalled();
    });

    it('submit publishes preparing k/N for the asset step', async () => {
      assetSvc.swapImagesToAssets.mockImplementation(
        async (_payload, _taskId, onAssetReady) => {
          await onAssetReady(0, 1);
          await onAssetReady(1, 1);
          return assets;
        },
      );
      axiosPost.mockResolvedValue({ data: { id: 'cgt-1' } });
      await processor.process(seedance2Job());

      const publish = (processor as any).redisPublisher.publish as jest.Mock;
      const preparing = publish.mock.calls
        .map(([, raw]) => JSON.parse(raw))
        .filter(
          (m) =>
            m.event === 'worker:video-progress' &&
            m.payload.stage === 'preparing',
        )
        .map((m) => [m.clientId, m.payload.current, m.payload.total]);
      expect(preparing).toEqual([
        ['c1', 0, 1],
        ['c1', 1, 1],
      ]);
    });

    it('video POST rejected → assets are deleted', async () => {
      assetSvc.swapImagesToAssets.mockResolvedValue(assets);
      axiosPost.mockRejectedValue({
        response: { status: 400, data: { error: { message: 'bad' } } },
      });
      await expect(processor.process(seedance2Job())).rejects.toThrow('bad');
      expect(assetSvc.cleanup).toHaveBeenCalledWith('t1', assets);
    });

    it('finalize and timeout delete the assets stored in ctx', async () => {
      seedCtx({ assets } as never);
      axiosGet.mockResolvedValue(succeeded);
      await processor.process({
        name: 'video-finalize',
        data: { taskId: 't1' },
      });
      expect(assetSvc.cleanup).toHaveBeenCalledWith('t1', assets);

      redis.store.clear();
      assetSvc.cleanup.mockClear();
      seedCtx({ assets, submittedAt: Date.now() - 60 * 60 * 1000 } as never);
      await processor.process({
        name: 'video-poll-check',
        data: { taskId: 't1' },
      });
      expect(assetSvc.cleanup).toHaveBeenCalledWith('t1', assets);
    });

    it('seedance1 never touches the asset library', async () => {
      axiosPost.mockResolvedValue({ data: { id: 'cgt-1' } });
      const job = seedance2Job();
      job.data.sendConfig.type = 'seedance1';
      await processor.process(job);
      expect(assetSvc.swapImagesToAssets).not.toHaveBeenCalled();
    });
  });

  describe('sweeper', () => {
    const OLD = Date.now() - 31 * 60 * 1000;
    const register = (taskId = 't1', enqueuedAt = OLD) => {
      redis.zset.set(taskId, enqueuedAt);
      redis.hash.set(
        taskId,
        JSON.stringify({
          clientId: 'c1',
          userId: 'u1',
          organizationId: 'org',
          projectId: 'proj',
        }),
      );
    };
    const sweep = () =>
      processor.process({ name: 'video-sweep', data: {} }) as Promise<
        Record<string, number>
      >;

    it('does nothing when no task is older than 30 minutes', async () => {
      register('t1', Date.now());
      expect(await sweep()).toEqual({ checked: 0 });
      expect(helper.updateUsedCreditFail).not.toHaveBeenCalled();
    });

    it('skips a task whose submit job is still waiting in the queue', async () => {
      register();
      queue.getJob.mockResolvedValue({ getState: async () => 'waiting' });
      const res = await sweep();
      expect(res.alive).toBe(1);
      expect(helper.updateUsedCreditFail).not.toHaveBeenCalled();
      expect(redis.zset.has('t1')).toBe(true);
    });

    it('skips a submitted task that poll-check can still close', async () => {
      register();
      seedCtx({ submittedAt: Date.now() - 5 * 60 * 1000 });
      queue.getJob.mockResolvedValue({ getState: async () => 'completed' });
      expect((await sweep()).alive).toBe(1);
      expect(helper.updateUsedCreditFail).not.toHaveBeenCalled();
    });

    it('fails + refunds a task the worker never picked up / died on, and notifies the user', async () => {
      register();
      queue.getJob.mockResolvedValue({ getState: async () => 'failed' });
      expect((await sweep()).failed).toBe(1);
      expect(helper.updateUsedCreditFail).toHaveBeenCalledTimes(1);
      expect(gallery.updateMany).toHaveBeenCalledWith({
        where: { taskId: 't1' },
        data: { genneratedStatus: 'FAILED' },
      });
      expect(publishedError()?.message).toMatch(/did not complete/);
      expect(redis.zset.has('t1')).toBe(false);
      expect(redis.hash.has('t1')).toBe(false);
    });

    it('never refunds twice when the task was already finalized', async () => {
      register();
      redis.store.set('video-final:t1', '1');
      expect((await sweep()).cleared).toBe(1);
      expect(helper.updateUsedCreditFail).not.toHaveBeenCalled();
      expect(redis.zset.has('t1')).toBe(false);
    });

    it('finalize removes the task from the inflight set', async () => {
      register('t1', Date.now());
      seedCtx();
      axiosGet.mockResolvedValue(succeeded);
      await processor.process({
        name: 'video-finalize',
        data: { taskId: 't1' },
      });
      expect(redis.zset.has('t1')).toBe(false);
    });
  });

  describe('gateway-wrapped provider error', () => {
    const inner =
      "The request failed because the input image 'content[1]' may contain real person. Request id: 0217";
    const wrapped = `Video generation task HTTP 400: ${JSON.stringify({
      error: {
        code: 'InputImageSensitiveContentDetected.PrivacyInformation',
        message: inner,
        param: '',
        type: 'BadRequest',
      },
    })}`;

    it('unwraps the provider message from the gateway string', () => {
      expect(unwrapProviderMessage(wrapped)).toBe(inner);
    });

    it('keeps plain text and broken JSON as is', () => {
      expect(unwrapProviderMessage('quota exceeded')).toBe('quota exceeded');
      expect(unwrapProviderMessage('bad {json')).toBe('bad {json');
    });

    it('submit rejected by the gateway → user gets only the provider message', async () => {
      axiosPost.mockRejectedValue({
        message: 'Request failed with status code 400',
        response: { status: 400, data: { error: { message: wrapped } } },
      });
      const job = {
        name: 'vdo-generate-queue',
        id: '1',
        attemptsMade: 0,
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
          body: { ...body, prompt: 'p', ratio: '1:1', image: [], files: [] },
        },
        updateData: jest.fn(),
      };
      await expect(processor.process(job)).rejects.toThrow(inner);
      expect(publishedError()?.message).toBe(inner);
    });
  });
});
