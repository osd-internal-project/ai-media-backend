import { NestFactory } from '@nestjs/core';
import { Transport, MicroserviceOptions } from '@nestjs/microservices';
import { EmailWorkerModule } from './email-worker.module';
import { EMAIL_QUEUE } from '@ai-media/share';
import { appConfigs } from './configs';

async function bootstrap() {
  // สร้าง Context เพื่อดึง Config ก่อน
  const rmqUrl = appConfigs().RABBITMQ_URL;
  const SMTP_FROM = appConfigs().SMTP_FROM;
  // สร้าง Microservice
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    EmailWorkerModule,
    {
      transport: Transport.RMQ,
      options: {
        urls: [rmqUrl],
        queue: EMAIL_QUEUE,
        noAck: false, // บังคับ Manual Ack
        queueOptions: { durable: true },
      },
    },
  );

  await app.listen();
  console.log('SMTP FROM:', SMTP_FROM);
  console.log('🚀 Email Worker is listening for jobs...');
}
bootstrap();