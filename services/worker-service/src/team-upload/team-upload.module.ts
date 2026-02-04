import { Module } from '@nestjs/common';
import { TeamUploadService } from './team-upload.service';
import { TeamUploadController } from './team-upload.controller';
import { PrismaModule, TosModule } from '@ai-media/share';

@Module({
  imports: [
    PrismaModule,TosModule
  ],
  controllers: [TeamUploadController],
  providers: [TeamUploadService]
})
export class TeamUploadModule {}
