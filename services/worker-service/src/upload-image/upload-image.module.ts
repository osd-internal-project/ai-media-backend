import { Module } from '@nestjs/common';
import { UploadImageService } from './upload-image.service';
import { UploadImageController } from './upload-image.controller';
import { UploadPolicyService } from './upload-policy.service';
import { UploadAccessService } from './upload-access.service';
import { PrismaModule, TosModule, StorageModule } from '@ai-media/share';

@Module({
  imports: [PrismaModule, TosModule, StorageModule],
  controllers: [UploadImageController],
  providers: [UploadImageService, UploadPolicyService, UploadAccessService],
})
export class UploadImageModule {}
