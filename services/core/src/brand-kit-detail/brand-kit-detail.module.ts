import { Module } from '@nestjs/common';
import { BrandKitDetailService } from './brand-kit-detail.service';
import { BrandKitDetailController } from './brand-kit-detail.controller';
import { PrismaModule } from '@ai-media/share';

@Module({
  imports: [PrismaModule],
  controllers: [BrandKitDetailController],
  providers: [BrandKitDetailService],
  exports: [BrandKitDetailService],
})
export class BrandKitDetailModule {}
