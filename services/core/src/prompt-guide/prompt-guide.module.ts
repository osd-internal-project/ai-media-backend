import { Module } from '@nestjs/common';
import { PromptGuideService } from './prompt-guide.service';
import { PromptGuideController } from './prompt-guide.controller';
import { PrismaModule, TosModule, StorageModule } from '@ai-media/share';

@Module({
  imports: [PrismaModule, TosModule, StorageModule],
  controllers: [PromptGuideController],
  providers: [PromptGuideService],
})
export class PromptGuideModule {}
