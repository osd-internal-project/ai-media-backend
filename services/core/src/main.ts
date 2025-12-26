import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { PrismaService } from '@ai-media/share';
import helmet from 'helmet';
import { InventoryMainModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import * as cors from 'cors';
import { appConfigs } from './configs';

async function bootstrap() {
  (BigInt.prototype as any).toJSON = function () {
    return this.toString();
  };
  const app = await NestFactory.create(InventoryMainModule);
  app.setGlobalPrefix('api');
  app.enableCors();
  app.enableCors({ origin: '*' });
  app.use(cors());
  app.use(helmet());
  const prismaService = app.get(PrismaService);
  prismaService.enableShutdownHooks(app as any);
  app.useGlobalPipes(new ValidationPipe());

  const options = new DocumentBuilder()
    .setTitle('Namecard API')
    .setDescription('The Namecard API description')
    .setVersion('1.0')
    .addTag('Namecard')
    .build();

  const document = SwaggerModule.createDocument(app, options);
  SwaggerModule.setup('api', app, document);

  await app.listen(appConfigs().port);
  console.log(`service start on port : ${appConfigs().port}`);
  console.log(`Swagger documentation: http://localhost:${appConfigs().port}/api`);
}
bootstrap();
