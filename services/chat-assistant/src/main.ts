import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { PrismaService } from '@ai-media/share';
import helmet from 'helmet';
import config from './configs';
import { ChatAssistantMainModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import * as cors from 'cors';

const PORT = config().port;

async function bootstrap() {
  (BigInt.prototype as any).toJSON = function () {
    return this.toString();
  };

  const app = await NestFactory.create(ChatAssistantMainModule, {
    bodyParser: true,
  });

  app.setGlobalPrefix('api');
  app.enableCors({ origin: '*' });
  app.use(cors());
  app.use(helmet({ contentSecurityPolicy: false }));

  const prismaService = app.get(PrismaService);
  prismaService.enableShutdownHooks(app as any);

  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true }),
  );

  const options = new DocumentBuilder()
    .setTitle('Chat Assistant API')
    .setDescription('AI Chat Assistant — Chat, Streaming, Vision Prompt Generation')
    .setVersion('1.0')
    .addTag('Chat')
    .addTag('Conversations')
    .build();

  const document = SwaggerModule.createDocument(app, options);
  SwaggerModule.setup('api/docs', app, document);

  await app.listen(PORT);
  console.log(`Chat Assistant service started on port: ${PORT}`);
  console.log(`Swagger: http://localhost:${PORT}/api/docs`);
}
bootstrap();
