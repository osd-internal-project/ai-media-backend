import { Module } from '@nestjs/common';
import { OmnihumenService } from './omnihumen.service';
import { OmnihumenController } from './omnihumen.controller';
// import { GenerateImageService } from 'src/generate-image/generate-image.service';
import { MinioClientModule } from 'src/minio-client/minio-client.module';
import { PrismaModule, TosModule } from '@ai-media/share';
import { HttpModule } from '@nestjs/axios';
@Module({
  imports: [PrismaModule, MinioClientModule, HttpModule,TosModule],
  controllers: [OmnihumenController],
  providers: [OmnihumenService],
})
export class OmnihumenModule {}
