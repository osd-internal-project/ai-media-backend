import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaService, assertEncryptionKeyReady } from '@ai-media/share';
import helmet from 'helmet';
import config from './configs';
import { InventoryMainModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import * as cors from 'cors';
const PORT = config().port;

/**
 * ตรวจ SOCIAL_TOKEN_ENC_KEY ตอน start ถ้าฟีเจอร์ Public Social ถูกเปิดใช้
 *
 * จงใจเช็คแบบมีเงื่อนไข ไม่ใช่ throw ตลอด — deployment ที่ยังไม่ใช้ฟีเจอร์นี้
 * ไม่ได้ตั้ง key ไว้ ถ้าบังคับทุกกรณีจะทำให้เซอร์วิสที่ใช้งานอยู่ start ไม่ขึ้น
 * แต่ถ้าเปิดฟีเจอร์แล้ว key หาย ต้องพังตรงนี้ ไม่ใช่ไปพังตอนแอดมินกด save token
 */
function assertSocialConfigReady() {
  if (config().social.enabledPlatforms.length === 0) return;
  assertEncryptionKeyReady();
}

async function bootstrap() {
  (BigInt.prototype as any).toJSON = function () {
    return this.toString();
  };
  assertSocialConfigReady();
  const app = await NestFactory.create<NestExpressApplication>(
    InventoryMainModule,
  );
  // bulk import ส่งได้ถึง 1000 แถวต่อ request (~300kb) — default 100kb ไม่พอ
  app.useBodyParser('json', { limit: '2mb' });
  app.setGlobalPrefix('api');
  app.enableCors();
  app.enableCors({ origin: '*' });
  app.use(cors());
  app.use(helmet());
  const prismaService = app.get(PrismaService);
  prismaService.enableShutdownHooks(app as any);
  app.useGlobalPipes(new ValidationPipe());

  // Swagger เปิดเฉพาะนอก prod — chart prod ใช้ "Production" จึงเทียบแบบไม่สนตัวพิมพ์
  if (process.env.NODE_ENV?.toLowerCase() !== 'production') {
    const options = new DocumentBuilder()
      .setTitle('Namecard API')
      .setDescription('The Namecard API description')
      .setVersion('1.0')
      .addTag('Namecard')
      .build();

    const document = SwaggerModule.createDocument(app, options);
    SwaggerModule.setup('api', app, document);
  }

  await app.listen(PORT);
  console.log(`emailApiUrl : ${config().emailApiUrl}`);
  console.log(`service start on port : ${PORT}`);
  console.log(`Swagger documentation: http://localhost:${PORT}/api`);
}
bootstrap();
