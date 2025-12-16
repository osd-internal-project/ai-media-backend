import { Module } from '@nestjs/common';
import { MasteradataConfigApiService } from './masteradata-config-api.service';
import { MasteradataConfigApiController } from './masteradata-config-api.controller';
import { PrismaModule } from '@ai-media/share';

@Module({
  imports: [PrismaModule],
  controllers: [MasteradataConfigApiController],
  providers: [MasteradataConfigApiService],
})
export class MasteradataConfigApiModule {}
