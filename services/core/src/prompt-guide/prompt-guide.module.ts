import { Module } from '@nestjs/common';
import { PromptGuideService } from './prompt-guide.service';
import { PromptGuideController } from './prompt-guide.controller';
import { PrismaModule } from '@ai-media/share';
import { MinioClientModule } from '../minio-client/minio-client.module';

@Module({
  imports: [PrismaModule, MinioClientModule],
  controllers: [PromptGuideController],
  providers: [PromptGuideService],
})
export class PromptGuideModule {}
