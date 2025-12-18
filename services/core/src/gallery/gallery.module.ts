import { Module } from '@nestjs/common';
import { GalleryService } from './gallery.service';
import { GalleryController } from './gallery.controller';
import { PrismaModule } from '@ai-media/share';
import { MinioClientModule } from '../minio-client/minio-client.module';

@Module({
  imports: [PrismaModule, MinioClientModule],
  controllers: [GalleryController],
  providers: [GalleryService],
})
export class GalleryModule { }
