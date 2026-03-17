import { Module } from '@nestjs/common';
import { BrandKitService } from './brand-kit.service';
import { BrandKitController } from './brand-kit.controller';
import { PrismaModule } from '@ai-media/share';

@Module({
  imports: [PrismaModule],
  controllers: [BrandKitController],
  providers: [BrandKitService],
  exports: [BrandKitService],
})
export class BrandKitModule {}
