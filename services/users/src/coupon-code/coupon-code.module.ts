import { Module } from '@nestjs/common';
import { CouponCodeService } from './coupon-code.service';
import { CouponCodeUsageService } from './coupon-code-usage.service';
import { CouponCodeController } from './coupon-code.controller';
import { PrismaModule } from '@ai-media/share';

@Module({
  imports: [PrismaModule],
  controllers: [CouponCodeController],
  providers: [CouponCodeService, CouponCodeUsageService],
  exports: [CouponCodeService, CouponCodeUsageService],
})
export class CouponCodeModule {}
