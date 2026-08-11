import { Module } from '@nestjs/common';
import { PrismaModule, StorageModule, TosModule } from '@ai-media/share';
import { LogsModule } from '../logs/logs.module';
import { CommunityPostController } from './community-post.controller';
import { CommunityPostService } from './community-post.service';
import { CommunityScheduleCron } from './community-schedule.cron';

@Module({
  imports: [PrismaModule, TosModule, StorageModule, LogsModule],
  controllers: [CommunityPostController],
  providers: [CommunityPostService, CommunityScheduleCron],
})
export class CommunityPostModule {}
