import { Module } from '@nestjs/common';
import { MasterdataModelTypeRepository, PrismaModule } from '@ai-media/share';
import { GenerateImageService } from './generate-image.service';
import { GenerateImageController } from './generate-image.controller';

@Module({
  imports: [PrismaModule],
  controllers: [GenerateImageController],
  providers: [GenerateImageService, MasterdataModelTypeRepository],
  exports: [GenerateImageService],
})
export class GenerateImageModule {}
