import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MailerModule } from '@nestjs-modules/mailer';
import { BullModule } from '@nestjs/bullmq';
import { GenerateModule } from './generate/generate.module';
import { QUEUE_NAME_IMAGE } from '@ai-media/share';
import { MinioClientModule } from './minio-client/minio-client.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    BullModule.forRoot({
      connection: {
        host: process.env.REDIS_HOST || 'localhost',
        port: 6379,
      },
    }),
    GenerateModule,
    MinioClientModule,
  ],
  controllers: [],
})
export class WorkerServiceModule { }