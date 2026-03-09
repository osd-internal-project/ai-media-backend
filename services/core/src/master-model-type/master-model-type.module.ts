import { Module } from '@nestjs/common';
import { MasterModelTypeService } from './master-model-type.service';
import { MasterModelTypeController } from './master-model-type.controller';
import { PrismaModule } from '@ai-media/share';

@Module({
  imports: [PrismaModule],
  controllers: [MasterModelTypeController],
  providers: [MasterModelTypeService],
})
export class MasterModelTypeModule {}
