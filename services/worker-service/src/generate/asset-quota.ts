import { Redis } from 'ioredis';

/**
 * BytePlus asset library limits, shared by every worker pod through Redis:
 * - CreateAsset QPM per account (3 / 120 / 300 by rights tier) — sliding 60s window
 * - assets per group + groups per account (free quota 50) — tasks share a pool of groups,
 *   each capped at `groupMax` live assets; a group is deleted once it is no longer current and empty
 */
export const ASSET_CREATE_WINDOW_MS = 60_000;
export const DEFAULT_ASSET_CREATE_QPM = 3;
export const DEFAULT_ASSET_GROUP_MAX = 20;

const PREFIX = 'byteplus:asset';
const createKey = `${PREFIX}:create`;
const currentKey = `${PREFIX}-group:current`;
const lockKey = `${PREFIX}-group:lock`;
const liveKey = (groupId: string) => `${PREFIX}-group:live:${groupId}`;

const positiveInt = (raw: string | undefined, fallback: number) => {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : fallback;
};
export const assetCreateQpm = () =>
  positiveInt(process.env.BYTEPLUS_ASSET_CREATE_QPM, DEFAULT_ASSET_CREATE_QPM);
export const assetGroupMax = () =>
  positiveInt(process.env.BYTEPLUS_ASSET_GROUP_MAX, DEFAULT_ASSET_GROUP_MAX);

// drop entries older than the window → room for n more? → add n unique members
const TAKE_LUA = `
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', ARGV[1] - ARGV[2])
local n = tonumber(ARGV[4])
if redis.call('ZCARD', KEYS[1]) + n > tonumber(ARGV[3]) then return 0 end
for i = 1, n do redis.call('ZADD', KEYS[1], ARGV[1], ARGV[5] .. ':' .. i) end
redis.call('PEXPIRE', KEYS[1], ARGV[2])
return 1
`;

/** Reserve `n` CreateAsset calls in the current minute; false = over the account QPM */
export async function takeAssetCreateTokens(
  redis: Redis,
  n: number,
  owner: string,
  qpm = assetCreateQpm(),
  now = Date.now(),
): Promise<boolean> {
  const res = await redis.eval(
    TAKE_LUA,
    1,
    createKey,
    now,
    ASSET_CREATE_WINDOW_MS,
    qpm,
    n,
    `${owner}:${now}`,
  );
  return res === 1;
}

// an empty group always takes the task, so a task with more images than max still runs
const RESERVE_LUA = `
local g = redis.call('GET', KEYS[1])
if not g then return false end
local live = tonumber(redis.call('GET', ARGV[3] .. g) or '0')
local n = tonumber(ARGV[1])
if live > 0 and live + n > tonumber(ARGV[2]) then return false end
redis.call('INCRBY', ARGV[3] .. g, n)
return g
`;

/** Take `n` asset slots in the current group; null = none yet or full (caller creates one) */
export async function reserveGroupSlots(
  redis: Redis,
  n: number,
  max = assetGroupMax(),
): Promise<string | null> {
  const res = await redis.eval(RESERVE_LUA, 1, currentKey, n, max, liveKey(''));
  return typeof res === 'string' ? res : null;
}

/** Only one pod creates the next group; others wait for it */
export async function lockGroupCreation(redis: Redis): Promise<boolean> {
  return (await redis.set(lockKey, '1', 'PX', 15_000, 'NX')) === 'OK';
}

/** Make `groupId` current with `n` slots already taken by the creating task */
export async function setCurrentGroup(
  redis: Redis,
  groupId: string,
  n: number,
): Promise<void> {
  await redis
    .multi()
    .set(liveKey(groupId), n)
    .set(currentKey, groupId)
    .del(lockKey)
    .exec();
}

export async function unlockGroupCreation(redis: Redis): Promise<void> {
  await redis.del(lockKey);
}

/** Stop handing out `groupId` (provider said full / gone); it is deleted once its live count hits 0 */
export async function retireGroup(
  redis: Redis,
  groupId: string,
): Promise<void> {
  const RETIRE_LUA = `if redis.call('GET', KEYS[1]) == ARGV[1] then redis.call('DEL', KEYS[1]) end return 1`;
  await redis.eval(RETIRE_LUA, 1, currentKey, groupId);
}

// returns 1 when the group is empty and no longer current → caller deletes it at BytePlus
const RELEASE_LUA = `
local live = redis.call('DECRBY', KEYS[1], ARGV[1])
if live > 0 then return 0 end
if redis.call('GET', KEYS[2]) == ARGV[2] then
  redis.call('SET', KEYS[1], 0)
  return 0
end
redis.call('DEL', KEYS[1])
return 1
`;

/** Give back `n` slots; true = group is empty and retired, delete it */
export async function releaseGroupSlots(
  redis: Redis,
  groupId: string,
  n: number,
): Promise<boolean> {
  const res = await redis.eval(
    RELEASE_LUA,
    2,
    liveKey(groupId),
    currentKey,
    n,
    groupId,
  );
  return res === 1;
}
