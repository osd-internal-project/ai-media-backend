import { Module } from '@nestjs/common';
import { PromptGuideTypeService } from './prompt-guide-type.service';
import { PromptGuideTypeController } from './prompt-guide-type.controller';
import { PrismaModule } from '@ai-media/share';

@Module({
  imports: [PrismaModule],
  controllers: [PromptGuideTypeController],
  providers: [PromptGuideTypeService],
})
export class PromptGuideTypeModule {}
