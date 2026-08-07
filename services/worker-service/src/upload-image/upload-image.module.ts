import { Module } from '@nestjs/common';
import { UploadImageService } from './upload-image.service';
import { UploadImageController } from './upload-image.controller';
import { PrismaModule, TosModule, StorageModule } from '@ai-media/share';

@Module({
  imports: [PrismaModule, TosModule, StorageModule],
  controllers: [UploadImageController],
  providers: [UploadImageService],
})
export class UploadImageModule {}
