import { Module } from '@nestjs/common';
import { UploadImageService } from './upload-image.service';
import { UploadImageController } from './upload-image.controller';
import { MinioClientModule } from '../minio-client/minio-client.module';
import { PrismaModule, TosModule } from '@ai-media/share';

@Module({
  imports: [PrismaModule, MinioClientModule,TosModule],
  controllers: [UploadImageController],
  providers: [UploadImageService]
})
export class UploadImageModule { }
