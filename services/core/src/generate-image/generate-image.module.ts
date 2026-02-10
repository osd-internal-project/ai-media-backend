import { Module } from '@nestjs/common';
import { PrismaModule, TosModule } from '@ai-media/share';
import { GenerateImageService } from './generate-image.service';
import { GenerateImageController } from './generate-image.controller';

@Module({
  imports: [PrismaModule, TosModule],
  controllers: [GenerateImageController],
  providers: [GenerateImageService],
  exports: [GenerateImageService],
})
export class GenerateImageModule { }
