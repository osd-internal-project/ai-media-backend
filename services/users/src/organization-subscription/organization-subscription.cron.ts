import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '@ai-media/share';

import * as dayjs from 'dayjs';
import { OrganizationSubscriptionService } from './organization-subscription.service';

/** key ของ pg advisory lock — ค่าคงที่ใดก็ได้ ขอแค่ไม่ซ้ำกับ lock อื่นในระบบ */
const RENEWAL_LOCK_KEY = 720_001;
/** เผื่อเวลาให้ต่อรอบทุก org จบภายใน transaction ที่ถือ lock */
const RENEWAL_TIMEOUT_MS = 10 * 60 * 1000;

@Injectable()
export class OrganizationSubscriptionCron {
  private readonly logger = new Logger(OrganizationSubscriptionCron.name);

  constructor(
    private readonly organizationSubscriptionService: OrganizationSubscriptionService,
    private readonly prisma: PrismaService,
  ) {}

  /** prod มีหลาย replica — ใช้ pg advisory lock ให้ต่อรอบแค่ pod เดียว (lock คืนเองเมื่อจบ transaction) */
  @Cron('0 0 * * *') // run once a day at 00:00 (cycle transition time).
  async handleSubscriptionRenewal() {
    this.logger.log('Running subscription renewal check...');
    try {
      const acquired = await this.prisma.$transaction(
        async (tx) => {
          const [{ locked }] = await tx.$queryRaw<{ locked: boolean }[]>`
            SELECT pg_try_advisory_xact_lock(${RENEWAL_LOCK_KEY}::bigint) AS locked`;
          if (!locked) return false;
          await this.organizationSubscriptionService.changeCycleSubscription();
          return true;
        },
        { timeout: RENEWAL_TIMEOUT_MS },
      );
      this.logger.log(
        acquired
          ? 'Subscription renewal lock acquired — renewal finished'
          : 'Subscription renewal skipped — another pod holds the lock',
      );
    } catch (error) {
      this.logger.error(
        `Subscription renewal failed: ${(error as Error).message}`,
        (error as Error).stack,
      );
    }
  }
}
