import axios from 'axios';
import { UnrecoverableError } from 'bullmq';
import { DreamactorProcessor } from './dreamactor.service';

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

const axiosPost = axios.post as jest.Mock;

/** in-memory Redis พอสำหรับ get/set(EX/NX)/exists */
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
    exists: jest.fn(async (k: string) => (store.has(k) ? 1 : 0)),
  };
};

const body = {
  organizationId: 'org',
  projectId: 'proj',
  prompt: 'hi',
  image: ['img.png', 'ref.mp4'],
};
const status = (s: string, respData?: string) => ({
  data: { data: { status: s, resp_data: respData } },
});
const done = status('done', JSON.stringify({ video_url: 'https://cv/v.mp4' }));

describe('DreamactorProcessor', () => {
  let redis: ReturnType<typeof makeRedis>;
  let helper: Record<string, jest.Mock>;
  let gallery: { updateMany: jest.Mock };
  let logs: { findOne: jest.Mock; updateMany: jest.Mock };
  let videoStorage: { storeVideoWithThumbnail: jest.Mock };
  let processor: DreamactorProcessor;
  let events: string[];
  let order: string[];

  const makeJob = (extra: Record<string, unknown> = {}) => {
    const job = {
      id: 't1',
      attemptsMade: 0,
      data: {
        taskId: 't1',
        clientId: 'c1',
        body,
        userId: 'u1',
        dreamactorTaskId: 't1',
        reqKey: 'jimeng_dream_actor',
        statusBaseUrl: 'https://gw/poll',
        sendApi: 'https://gw/submit',
        sendConfig: { type: 'dreamactor' },
        ...extra,
      } as Record<string, unknown>,
      updateData: jest.fn(async (d: Record<string, unknown>) => {
        job.data = d;
      }),
    };
    return job;
  };

  beforeEach(() => {
    redis = makeRedis();
    events = [];
    order = [];
    helper = {
      logAudit: jest.fn(),
      saveProviderTaskId: jest.fn(),
      logError: jest.fn(),
      updateUsedCreditSuccess: jest
        .fn()
        .mockResolvedValue({ usedCreditAllowance: 5, holdCreditAllowance: 0 }),
      updateUsedCreditFail: jest
        .fn()
        .mockResolvedValue({ usedCreditAllowance: 0, holdCreditAllowance: 0 }),
    };
    gallery = {
      updateMany: jest.fn(async (args: { data: { genneratedStatus: string } }) => {
        order.push(`gallery:${args.data.genneratedStatus}`);
      }),
    };
    logs = {
      findOne: jest.fn().mockResolvedValue({ usedCredit: 5 }),
      updateMany: jest.fn(),
    };
    videoStorage = {
      storeVideoWithThumbnail: jest
        .fn()
        .mockResolvedValue({ file: 'v.mp4', thumbnail: 'thumb-v.jpg' }),
    };
    axiosPost.mockReset();
    processor = new DreamactorProcessor(
      redis as never,
      gallery as never,
      logs as never,
      {} as never,
      {} as never,
      {
        resolveOutputUrl: jest.fn().mockResolvedValue('https://get'),
        toProviderUrl: jest.fn(async (v: string) => `https://p/${v}`),
        toProviderUrls: jest.fn(async (v: string[]) => v),
      } as never,
      videoStorage as never,
      helper as never,
    );
    jest.spyOn(processor as never, 'wait').mockResolvedValue(undefined as never);
    jest
      .spyOn(processor as never, 'publishToCore')
      .mockImplementation((async (_c: string, event: string) => {
        events.push(event);
        order.push(event);
      }) as never);
  });

  it('success: submits once, stores, charges the held credit, writes DB before upload-success', async () => {
    axiosPost
      .mockResolvedValueOnce({ data: { data: { task_id: 'cv-1' } } })
      .mockResolvedValueOnce(status('running'))
      .mockResolvedValueOnce(done);
    const job = makeJob();

    await processor.process(job);

    expect(axiosPost).toHaveBeenCalledTimes(3);
    expect(helper.saveProviderTaskId).toHaveBeenCalledWith('t1', 'cv-1');
    expect(axiosPost.mock.calls[2][1]).toEqual({
      req_key: 'jimeng_dream_actor',
      task_id: 'cv-1',
    });
    expect(job.data.providerTaskId).toBe('cv-1');
    expect(videoStorage.storeVideoWithThumbnail).toHaveBeenCalledWith(
      expect.objectContaining({ sourceUrl: 'https://cv/v.mp4' }),
    );
    expect(order.indexOf('gallery:SUCCESS')).toBeLessThan(
      order.indexOf('worker:dreamactor-upload-success'),
    );
    expect(events).toContain('worker:dreamactor-complete');
    expect(helper.updateUsedCreditSuccess).toHaveBeenCalledTimes(1);
    expect(helper.updateUsedCreditSuccess).toHaveBeenCalledWith(
      't1',
      'u1',
      'org',
      'proj',
      'credit',
      5,
    );
    expect(helper.updateUsedCreditFail).not.toHaveBeenCalled();
  });

  it('provider failed: error event + gallery FAILED + refund, never complete', async () => {
    axiosPost
      .mockResolvedValueOnce({ data: { data: { task_id: 'cv-1' } } })
      .mockResolvedValueOnce(status('failed'));

    await expect(processor.process(makeJob())).rejects.toBeInstanceOf(
      UnrecoverableError,
    );

    expect(events).toContain('worker:dreamactor-error');
    expect(events).not.toContain('worker:dreamactor-complete');
    expect(order).toContain('gallery:FAILED');
    expect(helper.updateUsedCreditFail).toHaveBeenCalledTimes(1);
    expect(helper.logError).toHaveBeenCalledTimes(1);
  });

  it('retry with providerTaskId: resumes polling without resubmitting', async () => {
    axiosPost.mockResolvedValueOnce(done);

    await processor.process(
      makeJob({ providerTaskId: 'cv-1', submittedAt: Date.now() }),
    );

    expect(axiosPost).toHaveBeenCalledTimes(1);
    expect(axiosPost.mock.calls[0][0]).toBe('https://gw/poll');
    expect(helper.saveProviderTaskId).not.toHaveBeenCalled();
    expect(helper.logAudit).not.toHaveBeenCalled();
  });

  it('job re-run after it already failed: refunds only once', async () => {
    axiosPost
      .mockResolvedValueOnce({ data: { data: { task_id: 'cv-1' } } })
      .mockResolvedValueOnce(status('failed'));
    const job = makeJob();
    await expect(processor.process(job)).rejects.toThrow();

    await processor.process(job);

    expect(helper.updateUsedCreditFail).toHaveBeenCalledTimes(1);
    expect(axiosPost).toHaveBeenCalledTimes(2);
  });

  it('status request fails once: keeps polling and still succeeds', async () => {
    axiosPost
      .mockRejectedValueOnce(new Error('ECONNRESET'))
      .mockResolvedValueOnce(done);

    await processor.process(
      makeJob({ providerTaskId: 'cv-1', submittedAt: Date.now() }),
    );

    expect(events).toContain('worker:dreamactor-complete');
    expect(helper.updateUsedCreditFail).not.toHaveBeenCalled();
  });

  it('past the poll timeout: fails without polling', async () => {
    await expect(
      processor.process(
        makeJob({
          providerTaskId: 'cv-1',
          submittedAt: Date.now() - 31 * 60 * 1000,
        }),
      ),
    ).rejects.toThrow('generation timed out');

    expect(axiosPost).not.toHaveBeenCalled();
    expect(events).toContain('worker:dreamactor-error');
    expect(helper.updateUsedCreditFail).toHaveBeenCalledTimes(1);
  });

  it('done without video_url: fails instead of storing an empty URL', async () => {
    axiosPost.mockResolvedValueOnce(status('done', 'not json'));

    await expect(
      processor.process(
        makeJob({ providerTaskId: 'cv-1', submittedAt: Date.now() }),
      ),
    ).rejects.toThrow('Provider returned no video_url');

    expect(videoStorage.storeVideoWithThumbnail).not.toHaveBeenCalled();
    expect(order).toContain('gallery:FAILED');
  });

  it('storing the video fails: marks failed once, no complete', async () => {
    axiosPost.mockResolvedValueOnce(done);
    videoStorage.storeVideoWithThumbnail.mockRejectedValue(
      new Error('Error processing video: no IMP'),
    );

    await expect(
      processor.process(
        makeJob({ providerTaskId: 'cv-1', submittedAt: Date.now() }),
      ),
    ).rejects.toThrow('no IMP');

    expect(events).not.toContain('worker:dreamactor-complete');
    expect(helper.updateUsedCreditFail).toHaveBeenCalledTimes(1);
    expect(helper.updateUsedCreditSuccess).not.toHaveBeenCalled();
  });
});
