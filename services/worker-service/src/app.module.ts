import { MiddlewareConsumer, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { GenerateModule } from './generate/generate.module';
import { UploadImageModule } from './upload-image/upload-image.module';
import { SocialPublishModule } from './social-publish/social-publish.module';
import { RequestLoggerMiddleware } from './middleware/request-logger.middleware';
import { TosModule, StorageModule } from '@ai-media/share';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    BullModule.forRoot({
      connection: {
        host: process.env.REDIS_HOST,
        port: Number(process.env.REDIS_PORT),
        ...(process.env.REDIS_PASSWORD && {
          password: process.env.REDIS_PASSWORD,
        }),
      },
    }),
    GenerateModule,
    UploadImageModule,
    SocialPublishModule,
    TosModule,
    StorageModule,
  ],
  controllers: [],
})
export class WorkerServiceModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestLoggerMiddleware).forRoutes('*');
  }
}
