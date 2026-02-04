import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { WebsocketGatewayService } from './websocket.gateway';
import { WebsocketService } from './websocket.service';
import { GenerateService } from 'src/generate/generate.service';
import { PrismaModule, QUEUE_NAME_IMAGE, QUEUE_NAME_VDO, TosModule } from '@ai-media/share';
import { MinioClientModule } from 'src/minio-client/minio-client.module';
import { RedisModule } from '@nestjs-modules/ioredis';
import { LogsService } from 'src/logs/logs.service';

@Module({
  imports: [PrismaModule, MinioClientModule, TosModule,
    RedisModule.forRoot({
      type: 'single',
      url: process.env.REDIS_URL || 'redis://localhost:6379',
    }),
    BullModule.registerQueue({
      name: QUEUE_NAME_IMAGE,
    }),
    BullModule.registerQueue({
      name: QUEUE_NAME_VDO,
    }),
    BullModule.registerQueue({
      name: 'tasks',
    }),
  ],
  providers: [WebsocketGatewayService, GenerateService, WebsocketService, LogsService],
  exports: [WebsocketGatewayService, GenerateService, WebsocketService, LogsService],
})
export class WebsocketModule { }