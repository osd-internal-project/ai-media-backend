import { Module } from '@nestjs/common';
import { BrandKitDetailTypeService } from './brand-kit-detail-type.service';
import { BrandKitDetailTypeController } from './brand-kit-detail-type.controller';
import { PrismaModule } from '@ai-media/share';

@Module({
  imports: [PrismaModule],
  controllers: [BrandKitDetailTypeController],
  providers: [BrandKitDetailTypeService],
  exports: [BrandKitDetailTypeService],
})
export class BrandKitDetailTypeModule {}
