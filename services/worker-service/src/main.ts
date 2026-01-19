import { NestFactory } from '@nestjs/core';
import { Transport, MicroserviceOptions } from '@nestjs/microservices';
import { WorkerServiceModule } from './app.module';
import { EMAIL_QUEUE } from '@ai-media/share';
import { appConfigs } from './configs';
import { Logger } from '@nestjs/common';

async function bootstrap() {
  // สร้าง Context เพื่อดึง Config ก่อน
  const rmqUrl = appConfigs().RABBITMQ_URL;
  // สร้าง Microservice
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    WorkerServiceModule,
  );

  await app.listen();
  Logger.log(`port ${appConfigs().port}`, '🚀 Worker Service is listening for jobs...');
}
bootstrap();