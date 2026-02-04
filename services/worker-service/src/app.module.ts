import { MiddlewareConsumer, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MailerModule } from '@nestjs-modules/mailer';
import { BullModule } from '@nestjs/bullmq';
import { GenerateModule } from './generate/generate.module';
import { QUEUE_NAME_IMAGE } from '@ai-media/share';
import { MinioClientModule } from './minio-client/minio-client.module';
import { UploadImageModule } from './upload-image/upload-image.module';
import { RequestLoggerMiddleware } from './middleware/request-logger.middleware';
import { TeamUploadModule } from './team-upload/team-upload.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    BullModule.forRoot({
      connection: {
        host: process.env.REDIS_HOST || 'localhost',
        port: Number(process.env.REDIS_PORT) || 6379,
      },
    }),
    GenerateModule,
    MinioClientModule,
    UploadImageModule,
    TeamUploadModule,
  ],
  controllers: [],
})
export class WorkerServiceModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestLoggerMiddleware).forRoutes('*');
  }
}