import { Module } from '@nestjs/common';
import { MasterdataModelTypeRepository, PrismaModule } from '@ai-media/share';
import { GenerateImageService } from './generate-image.service';
import { GenerateImageController } from './generate-image.controller';
import { MinioClientModule } from 'src/minio-client/minio-client.module';

@Module({
  imports: [PrismaModule, MinioClientModule],
  controllers: [GenerateImageController],
  providers: [GenerateImageService],
  exports: [GenerateImageService],
})
export class GenerateImageModule { }
