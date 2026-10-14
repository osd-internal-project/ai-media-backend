import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QUEUE_NAME_VDO } from '@ai-media/share';
import { ByteplusWebhookController } from './byteplus-webhook.controller';
import { ByteplusWebhookService } from './byteplus-webhook.service';

@Module({
  imports: [BullModule.registerQueue({ name: QUEUE_NAME_VDO })],
  controllers: [ByteplusWebhookController],
  providers: [ByteplusWebhookService],
})
export class ByteplusWebhookModule {}
