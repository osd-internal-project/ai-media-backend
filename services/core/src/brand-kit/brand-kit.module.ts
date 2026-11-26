import { Module } from '@nestjs/common';
import { BrandKitService } from './brand-kit.service';
import { BrandKitController } from './brand-kit.controller';
import { PrismaModule, StorageModule } from '@ai-media/share';
import { BrandKitPromptService } from './brand-kit-prompt.service';

@Module({
  imports: [PrismaModule, StorageModule],
  controllers: [BrandKitController],
  providers: [BrandKitService, BrandKitPromptService],
  exports: [BrandKitService, BrandKitPromptService],
})
export class BrandKitModule {}
