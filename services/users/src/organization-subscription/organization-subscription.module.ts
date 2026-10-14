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
import { OmiseModule } from '../omise/omise.module';

@Module({
  imports: [PrismaModule, OmiseModule],
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
