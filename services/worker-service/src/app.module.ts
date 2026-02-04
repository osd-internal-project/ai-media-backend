import { MiddlewareConsumer, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { GenerateModule } from './generate/generate.module';
import { UploadImageModule } from './upload-image/upload-image.module';
import { RequestLoggerMiddleware } from './middleware/request-logger.middleware';
import { TosModule } from '@ai-media/share';

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
    UploadImageModule,
    TosModule,
  ],
  controllers: [],
})
export class WorkerServiceModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestLoggerMiddleware).forRoutes('*');
  }
}