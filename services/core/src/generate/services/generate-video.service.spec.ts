import { VIDEO_INFLIGHT_DATA_KEY, VIDEO_INFLIGHT_KEY } from '@ai-media/share';
import {
  GenerateVideoService,
  unsupportedVideoOption,
} from './generate-video.service';

const makeService = (exec: jest.Mock) => {
  const chain = {
    zadd: jest.fn(() => chain),
    hset: jest.fn(() => chain),
    exec,
  };
  const redis = { multi: jest.fn(() => chain) };
  const service = new GenerateVideoService(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    redis as never,
    {} as never,
    {} as never,
    {} as never,
  );
  // afterEnqueue เป็น protected hook — เรียกตรงเพื่อทดสอบแยกจาก flow ทั้งก้อน
  const afterEnqueue = (
    service as unknown as {
      afterEnqueue: (...args: unknown[]) => Promise<void>;
    }
  ).afterEnqueue.bind(service);
  return { chain, afterEnqueue };
};

const body = { organizationId: 'org', projectId: 'proj' };

describe('GenerateVideoService.afterEnqueue (sweeper registration)', () => {
  it('registers the task in the inflight set with what the fail path needs', async () => {
    const { chain, afterEnqueue } = makeService(jest.fn().mockResolvedValue([]));
    await afterEnqueue('t1', 'c1', 'u1', body);
    expect(chain.zadd).toHaveBeenCalledWith(
      VIDEO_INFLIGHT_KEY,
      expect.any(Number),
      't1',
    );
    expect(chain.hset).toHaveBeenCalledWith(
      VIDEO_INFLIGHT_DATA_KEY,
      't1',
      JSON.stringify({
        clientId: 'c1',
        userId: 'u1',
        organizationId: 'org',
        projectId: 'proj',
      }),
    );
  });

  it('never throws when Redis fails — the job is already queued', async () => {
    const { afterEnqueue } = makeService(
      jest.fn().mockRejectedValue(new Error('redis down')),
    );
    await expect(afterEnqueue('t1', 'c1', 'u1', body)).resolves.toBeUndefined();
  });
});

describe('unsupportedVideoOption', () => {
  const mini = { resolutions: ['480p', '720p'] };
  const v25 = { duration: { min: 4, max: 30 } };

  it('accepts anything when the model sets no limits', () => {
    expect(unsupportedVideoOption({}, { resolution: '1080p', duration: 15 })).toBeNull();
    expect(unsupportedVideoOption(null, { resolution: '1080p', duration: 15 })).toBeNull();
  });

  it('rejects a resolution outside sendConfig.resolutions', () => {
    expect(unsupportedVideoOption(mini, { resolution: '1080p', duration: 5 })).toBe(
      'Resolution 1080p is not supported (use 480p, 720p)',
    );
    expect(unsupportedVideoOption(mini, { resolution: '720p', duration: 5 })).toBeNull();
  });

  it('rejects a duration outside sendConfig.duration, inclusive bounds pass', () => {
    expect(unsupportedVideoOption(v25, { resolution: '720p', duration: 31 })).toBe(
      'Duration 31s is not supported (use 4-30s)',
    );
    expect(unsupportedVideoOption(v25, { resolution: '720p', duration: 3 })).not.toBeNull();
    expect(unsupportedVideoOption(v25, { resolution: '720p', duration: 30 })).toBeNull();
    expect(unsupportedVideoOption(v25, { resolution: '720p', duration: 4 })).toBeNull();
  });
});
