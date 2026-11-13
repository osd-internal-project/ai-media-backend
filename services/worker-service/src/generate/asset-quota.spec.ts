import Redis from 'ioredis';
import {
  lockGroupCreation,
  releaseGroupSlots,
  reserveGroupSlots,
  retireGroup,
  setCurrentGroup,
  takeAssetCreateTokens,
} from './asset-quota';

// Lua needs a real Redis: REDIS_TEST_URL=redis://127.0.0.1:6379/15 (never a shared/prod URL)
const url = process.env.REDIS_TEST_URL;
const suite = url ? describe : describe.skip;

suite('asset-quota (real Redis)', () => {
  let redis: Redis;

  beforeAll(() => {
    redis = new Redis(url as string);
  });
  afterAll(async () => {
    await redis.quit();
  });
  beforeEach(async () => {
    const keys = await redis.keys('byteplus:asset*');
    if (keys.length) await redis.del(...keys);
  });

  it('CreateAsset QPM: takes n at once, refuses over the limit, frees after the window', async () => {
    const t0 = 1_000_000;
    expect(await takeAssetCreateTokens(redis, 2, 'a', 3, t0)).toBe(true);
    expect(await takeAssetCreateTokens(redis, 2, 'b', 3, t0 + 1)).toBe(false);
    expect(await takeAssetCreateTokens(redis, 1, 'c', 3, t0 + 2)).toBe(true);
    expect(await takeAssetCreateTokens(redis, 1, 'd', 3, t0 + 3)).toBe(false);
    expect(await takeAssetCreateTokens(redis, 3, 'e', 3, t0 + 60_001)).toBe(
      false,
    );
    expect(await takeAssetCreateTokens(redis, 3, 'e', 3, t0 + 60_003)).toBe(
      true,
    );
  });

  it('pool: reserve until max, then null so the caller creates the next group', async () => {
    expect(await reserveGroupSlots(redis, 1, 3)).toBeNull();
    expect(await lockGroupCreation(redis)).toBe(true);
    expect(await lockGroupCreation(redis)).toBe(false);
    await setCurrentGroup(redis, 'g1', 1);
    expect(await lockGroupCreation(redis)).toBe(true); // setCurrentGroup released the lock
    expect(await reserveGroupSlots(redis, 2, 3)).toBe('g1');
    expect(await reserveGroupSlots(redis, 1, 3)).toBeNull();
  });

  it('an empty group takes a task bigger than max', async () => {
    await setCurrentGroup(redis, 'g1', 0);
    expect(await reserveGroupSlots(redis, 5, 3)).toBe('g1');
  });

  it('release: current group is kept at 0; a retired group is deleted only when empty', async () => {
    await setCurrentGroup(redis, 'g1', 2);
    expect(await releaseGroupSlots(redis, 'g1', 2)).toBe(false);
    expect(await redis.get('byteplus:asset-group:live:g1')).toBe('0');

    await setCurrentGroup(redis, 'g2', 2);
    await retireGroup(redis, 'g2');
    expect(await reserveGroupSlots(redis, 1, 3)).toBeNull();
    expect(await releaseGroupSlots(redis, 'g2', 1)).toBe(false);
    expect(await releaseGroupSlots(redis, 'g2', 1)).toBe(true);
    expect(await redis.exists('byteplus:asset-group:live:g2')).toBe(0);
  });

  it('retire only clears current when it still points at that group', async () => {
    await setCurrentGroup(redis, 'g1', 0);
    await retireGroup(redis, 'old');
    expect(await reserveGroupSlots(redis, 1, 3)).toBe('g1');
  });
});
