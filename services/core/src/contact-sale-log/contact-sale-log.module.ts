import { Module } from '@nestjs/common';
import { ContactSaleLogController } from './contact-sale-log.controller';
import { ContactSaleLogService } from './contact-sale-log.service';
import { PrismaModule, EMAIL_QUEUE } from '@ai-media/share';
import { BullModule } from '@nestjs/bullmq';

@Module({
  imports: [
    PrismaModule,
    BullModule.registerQueue({
      name: EMAIL_QUEUE,
    }),
  ],
  controllers: [ContactSaleLogController],
  providers: [ContactSaleLogService]
})
export class ContactSaleLogModule {}
