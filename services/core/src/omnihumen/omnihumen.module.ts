import { Module } from '@nestjs/common';
import { OmnihumenService } from './omnihumen.service';
import { OmnihumenController } from './omnihumen.controller';
import { GenerateImageService } from 'src/generate-image/generate-image.service';
import { MinioClientModule } from 'src/minio-client/minio-client.module';
import { PrismaModule } from '@ai-media/share';
import { HttpModule } from '@nestjs/axios';
@Module({
  imports: [PrismaModule, MinioClientModule, HttpModule],
  controllers: [OmnihumenController],
  providers: [OmnihumenService, GenerateImageService],
})
export class OmnihumenModule {}
