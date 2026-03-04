import { Module } from '@nestjs/common';
import { OrganizationSubscriptionService } from './organization-subscription.service';
import { OrganizationSubscriptionController } from './organization-subscription.controller';
import {
  OrganizationSubscriptionRepository,
  PrismaModule,
} from '@ai-media/share';

@Module({
  imports: [PrismaModule],
  controllers: [OrganizationSubscriptionController],
  providers: [OrganizationSubscriptionService],
  exports: [OrganizationSubscriptionService],
})
export class OrganizationSubscriptionModule {}
