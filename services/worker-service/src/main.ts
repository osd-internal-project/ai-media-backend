import { NestFactory } from '@nestjs/core';
import { Transport, MicroserviceOptions } from '@nestjs/microservices';
import { WorkerServiceModule } from './app.module';
import { appConfigs } from './configs';
import { Logger } from '@nestjs/common';

async function bootstrap() {
  /*
  // สร้าง Context เพื่อดึง Config ก่อน
  const rmqUrl = appConfigs().RABBITMQ_URL;
  */
  // สร้าง Microservice
  (BigInt.prototype as any).toJSON = function () {
    return this.toString();
  };
  const app = await NestFactory.create(WorkerServiceModule);
  // app.setGlobalPrefix('api');
  app.enableCors();

  await app.listen(appConfigs().port);
  Logger.log(`port ${appConfigs().port}`, '🚀 Worker Service is listening for jobs...');
}
bootstrap();