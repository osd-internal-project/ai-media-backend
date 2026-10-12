import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { PrismaService } from '@ai-media/share';
import helmet from 'helmet';
import config from './configs';
import { ChatAssistantMainModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

const PORT = config().port;

async function bootstrap() {
  (BigInt.prototype as any).toJSON = function () {
    return this.toString();
  };

  const app = await NestFactory.create(ChatAssistantMainModule, {
    bodyParser: true,
  });

  app.setGlobalPrefix('api');

  // จำกัด origin ที่เรียกได้ — เดิมเป็น '*' ซึ่งแปลว่าเว็บใดก็ยิงมาได้จากเบราว์เซอร์
  // ของผู้ใช้ ตอนนี้คำขอผูกกับ key ของ org ยิ่งต้องคุมให้แคบ
  // ปล่อยว่าง = อนุญาตทุก origin (ไว้ใช้ตอน dev เท่านั้น)
  const { allowedOrigins } = config().cors;
  app.enableCors({
    origin: allowedOrigins.length > 0 ? allowedOrigins : true,
    credentials: true,
  });
  app.use(helmet({ contentSecurityPolicy: false }));

  const prismaService = app.get(PrismaService);
  prismaService.enableShutdownHooks(app as any);

  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true }),
  );

  // Swagger เปิดเฉพาะนอก prod — chart prod ใช้ "Production" จึงเทียบแบบไม่สนตัวพิมพ์
  if (process.env.NODE_ENV?.toLowerCase() !== 'production') {
    const options = new DocumentBuilder()
      .setTitle('Chat Assistant API')
      .setDescription('AI Chat Assistant — Chat, Streaming, Vision Prompt Generation')
      .setVersion('1.0')
      .addTag('Chat')
      .addTag('Conversations')
      .build();

    const document = SwaggerModule.createDocument(app, options);
    SwaggerModule.setup('api/docs', app, document);
  }

  await app.listen(PORT);
  console.log(`Chat Assistant service started on port: ${PORT}`);
  console.log(`Swagger: http://localhost:${PORT}/api/docs`);
}
bootstrap();
