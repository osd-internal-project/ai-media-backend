import { Module } from '@nestjs/common';
import { PrismaModule } from '@ai-media/share';
import { BillingProfileService } from './billing-profile.service';
import { BillingProfileController } from './billing-profile.controller';

@Module({
  imports: [PrismaModule],
  controllers: [BillingProfileController],
  providers: [BillingProfileService],
  exports: [BillingProfileService],
})
export class BillingProfileModule {}
