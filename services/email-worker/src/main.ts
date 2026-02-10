import { NestFactory } from '@nestjs/core';
import { EmailWorkerModule } from './email-worker.module';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(EmailWorkerModule);
  // SMTP_FROM is used inside module/templates, just logging here
  console.log('🚀 Email Worker is listening for jobs...');
}
bootstrap();