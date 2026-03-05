import { Module } from '@nestjs/common';
import { OrganizationSubscriptionService } from './organization-subscription.service';
import { OrganizationSubscriptionController } from './organization-subscription.controller';
import { OrganizationSubscriptionCron } from './organization-subscription.cron';
import {
  OrganizationSubscriptionRepository,
  CreditBalanceRepository,
  PackageTransactionRepository,
  PrismaModule,
} from '@ai-media/share';

@Module({
  imports: [PrismaModule],
  controllers: [OrganizationSubscriptionController],
  providers: [
    OrganizationSubscriptionService,
    OrganizationSubscriptionCron,
    CreditBalanceRepository,
    PackageTransactionRepository,
  ],
  exports: [OrganizationSubscriptionService],
})
export class OrganizationSubscriptionModule {}
