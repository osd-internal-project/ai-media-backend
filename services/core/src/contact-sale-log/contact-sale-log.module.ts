import { Module } from '@nestjs/common';
import { ContactSaleLogController } from './contact-sale-log.controller';
import { ContactSaleLogService } from './contact-sale-log.service';
import { PrismaModule } from '@ai-media/share';
import { HttpModule } from '@nestjs/axios';

@Module({
  imports: [PrismaModule, HttpModule],
  controllers: [ContactSaleLogController],
  providers: [ContactSaleLogService],
})
export class ContactSaleLogModule {}
