import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { appConfigs } from './configs';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Validate request bodies against the DTOs and strip unknown properties.
  app.useGlobalPipes(new ValidationPipe({ whitelist: true }));

  await app.listen(appConfigs().port); // เริ่มรัน HTTP Server
  console.log('Application is running on: http://localhost:' + appConfigs().port);
}
bootstrap();