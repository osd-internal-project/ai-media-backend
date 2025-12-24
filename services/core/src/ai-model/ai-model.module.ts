import { Module } from '@nestjs/common';
import { AiModelController } from './ai-model.controller';
import { AiModelService } from './ai-model.service';
import { MasterdataModelTypeRepository } from '@ai-media/share';
import { PrismaModule } from '@ai-media/share';

@Module({
  imports: [PrismaModule],
  controllers: [AiModelController],
  providers: [AiModelService, MasterdataModelTypeRepository],
  exports: [AiModelService],
})
export class AiModelModule {}