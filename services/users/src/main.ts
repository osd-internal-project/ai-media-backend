import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { PrismaService } from '@ai-media/share';
import helmet from 'helmet';
import config from './configs';
import { InventoryMainModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import * as cors from 'cors';
const PORT = config().port;

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

  await app.listen(PORT);
  console.log(`service start on port : ${PORT}`);
  console.log(`Swagger documentation: http://localhost:${PORT}/api`);
}
bootstrap();
