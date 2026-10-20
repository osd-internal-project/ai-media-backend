import { Redis } from 'ioredis';

/** default จำนวนงานที่ค้างที่ provider ต่อ model — ทับได้ด้วย `sendConfig.maxConcurrent` */
export const VIDEO_SLOT_DEFAULT_LIMIT = 10;
/** slot ที่ค้างนานกว่านี้ถือว่าเจ้าของตายแล้ว (เกิน sweeper 30 นาที) — ลบทิ้งตอนจองครั้งถัดไป */
export const VIDEO_SLOT_STALE_MS = 35 * 60 * 1000;

const slotsKey = (model: string) => `video:slots:${model}`;
const ownerKey = (taskId: string) => `video:slot-owner:${taskId}`;

// ลบ slot ค้าง → จองซ้ำได้ (retry) → เต็มไหม → จอง + จำว่า task นี้ถือ slot ของ model ไหน
const ACQUIRE_LUA = `
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', ARGV[2])
if redis.call('ZSCORE', KEYS[1], ARGV[4]) then return 1 end
if redis.call('ZCARD', KEYS[1]) >= tonumber(ARGV[3]) then return 0 end
redis.call('ZADD', KEYS[1], ARGV[1], ARGV[4])
redis.call('SET', KEYS[2], KEYS[1], 'PX', ARGV[5])
return 1
`;

const RELEASE_LUA = `
local slots = redis.call('GET', KEYS[1])
if not slots then return 0 end
redis.call('ZREM', slots, ARGV[1])
redis.call('DEL', KEYS[1])
return 1
`;

/** ค่า limit จาก sendConfig ของ model — ค่าที่ไม่ใช่จำนวนเต็มบวกใช้ default */
export const slotLimit = (sendConfig: Record<string, unknown>): number => {
  const n = Number(sendConfig?.maxConcurrent);
  return Number.isInteger(n) && n > 0 ? n : VIDEO_SLOT_DEFAULT_LIMIT;
};

/** จอง slot ของ model ให้ task — atomic ข้าม worker pod; คืน false ถ้าเต็ม */
export async function acquireVideoSlot(
  redis: Redis,
  model: string,
  taskId: string,
  limit: number,
  now = Date.now(),
): Promise<boolean> {
  const res = await redis.eval(
    ACQUIRE_LUA,
    2,
    slotsKey(model),
    ownerKey(taskId),
    now,
    now - VIDEO_SLOT_STALE_MS,
    limit,
    taskId,
    VIDEO_SLOT_STALE_MS,
  );
  return res === 1;
}

/** คืน slot ที่ task ถือ (ถ้ามี) — เรียกซ้ำได้ */
export async function releaseVideoSlot(
  redis: Redis,
  taskId: string,
): Promise<void> {
  await redis.eval(RELEASE_LUA, 1, ownerKey(taskId), taskId);
}
