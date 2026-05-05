import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { WebsocketGatewayService } from './websocket.gateway';
import { WebsocketService } from './websocket.service';
import { GenerateModule } from 'src/generate/generate.module';
import {
  PrismaModule,
  QUEUE_NAME_IMAGE,
  QUEUE_NAME_VDO,
  QUEUE_NAME_OMNIHUMEN,
  QUEUE_NAME_DREAMACTOR,
  TosModule,
} from '@ai-media/share';
import { RedisModule } from '@nestjs-modules/ioredis';
import { LogsService } from 'src/logs/logs.service';

@Module({
  imports: [
    PrismaModule,
    TosModule,
    GenerateModule,
    RedisModule.forRoot({
      type: 'single',
      url: `redis://${process.env.REDIS_HOST}:${process.env.REDIS_PORT}`,
      ...(process.env.REDIS_PASSWORD && {
        options: {
          password: process.env.REDIS_PASSWORD,
        },
      }),
    }),
    BullModule.registerQueue({
      name: QUEUE_NAME_IMAGE,
    }),
    BullModule.registerQueue({
      name: QUEUE_NAME_VDO,
    }),
    BullModule.registerQueue({
      name: QUEUE_NAME_OMNIHUMEN,
    }),
    BullModule.registerQueue({
      name: QUEUE_NAME_DREAMACTOR,
    }),
    BullModule.registerQueue({
      name: 'tasks',
    }),
  ],
  providers: [
    WebsocketGatewayService,
    WebsocketService,
    LogsService,
  ],
  exports: [
    WebsocketGatewayService,
    WebsocketService,
    LogsService,
  ],
})
export class WebsocketModule {}
