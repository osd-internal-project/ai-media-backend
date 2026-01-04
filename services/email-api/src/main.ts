import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { appConfigs } from './configs';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  await app.listen(appConfigs().port); // เริ่มรัน HTTP Server
  console.log('Application is running on: http://localhost:' + appConfigs().port);
}
bootstrap();