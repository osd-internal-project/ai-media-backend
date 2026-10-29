/**
 * Charges what updateUsedCreditSuccess parked after its retries failed.
 * Dry run lists the debts; `--apply` charges each one and clears it.
 *   npx ts-node -r tsconfig-paths/register src/scripts/settle-unsettled.ts [--apply]
 */
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import {
  CreditCharge,
  SETTLEMENT_TTL_SECONDS,
  chargeCredit,
  settlementKey,
  unsettledKey,
} from '../generate/generate-helper.service';

const apply = process.argv.includes('--apply');

async function main() {
  const redis = new Redis({
    host: process.env.REDIS_HOST,
    port: Number(process.env.REDIS_PORT),
    ...(process.env.REDIS_PASSWORD && { password: process.env.REDIS_PASSWORD }),
  });
  const prisma = new PrismaClient();
  try {
    const keys = await redis.keys(unsettledKey('*'));
    console.log(
      `${keys.length} unsettled charge(s)${
        apply ? '' : ' — dry run, pass --apply to charge'
      }`,
    );
    for (const key of keys) {
      const raw = await redis.get(key);
      if (!raw) continue;
      const charge = JSON.parse(raw) as CreditCharge;
      console.log(JSON.stringify(charge));
      if (!apply) continue;
      await chargeCredit(prisma, charge);
      await redis.set(
        settlementKey(charge.taskId),
        'charged',
        'EX',
        SETTLEMENT_TTL_SECONDS,
      );
      await redis.del(key);
      console.log(`charged ${charge.trueAmount} for ${charge.taskId}`);
    }
  } finally {
    await prisma.$disconnect();
    redis.disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
