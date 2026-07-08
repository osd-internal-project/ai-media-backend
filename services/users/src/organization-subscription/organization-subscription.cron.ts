import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import * as dayjs from 'dayjs';
import { OrganizationSubscriptionService } from './organization-subscription.service';

@Injectable()
export class OrganizationSubscriptionCron {
  private readonly logger = new Logger(OrganizationSubscriptionCron.name);

  constructor(
    private readonly organizationSubscriptionService: OrganizationSubscriptionService,
  ) {}

  @Cron('0 0 * * *') // run once a day at 00:00 (cycle transition time).
  async handleSubscriptionRenewal() {
    this.logger.log('Running subscription renewal check...');
    this.organizationSubscriptionService.changeCycleSubscription();
  }
}
