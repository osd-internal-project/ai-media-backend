import { Module } from '@nestjs/common';
import { GalleryService } from './gallery.service';
import { GalleryController } from './gallery.controller';
import { PrismaModule, TosModule } from '@ai-media/share';

@Module({
  imports: [PrismaModule, TosModule],
  controllers: [GalleryController],
  providers: [GalleryService],
})
export class GalleryModule { }
