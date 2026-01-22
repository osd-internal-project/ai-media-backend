import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { PrismaService } from '@ai-media/share';
import helmet from 'helmet';
import { InventoryMainModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { appConfigs, redisConfigs } from './configs';

async function bootstrap() {
  (BigInt.prototype as any).toJSON = function () {
    return this.toString();
  };

  const app = await NestFactory.create(InventoryMainModule);

  // ===================================
  // 1. CORS Configuration (ทำครั้งเดียว)
  // ===================================
  app.enableCors({
    origin: ['http://localhost:3000', 'http://localhost:4002', '*'], // ระบุ origins ที่อนุญาต
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
  });

  // ===================================
  // 2. Helmet Configuration (แก้ไขให้รองรับ WebSocket)
  // ===================================
  app.use(
    helmet({
      contentSecurityPolicy: false, // ปิด CSP หรือปรับแต่งให้รองรับ WebSocket
      crossOriginEmbedderPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    })
  );

  // ===================================
  // 3. Global Prefix (ระวัง: จะเปลี่ยน WebSocket path)
  // ===================================
  app.setGlobalPrefix('api', {
    exclude: [], // ถ้าต้องการให้ WebSocket ไม่มี prefix ให้ใส่ path ที่ต้องการ exclude
  });
  // หมายเหตุ: WebSocket จะอยู่ที่ /socket.io (ไม่มี /api prefix)
  // หรือถ้าตั้ง namespace เป็น /api/websocket จะเป็น /api/websocket

  // ===================================
  // 4. Prisma & Validation
  // ===================================
  const prismaService = app.get(PrismaService);
  prismaService.enableShutdownHooks(app as any);
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: false,
    })
  );

  // ===================================
  // 5. Swagger Documentation
  // ===================================
  const options = new DocumentBuilder()
    .setTitle('AI Media API')
    .setDescription('The AI Media API description')
    .setVersion('1.0')
    .addTag('AI Media')
    .build();

  const document = SwaggerModule.createDocument(app, options);
  SwaggerModule.setup('api', app, document);

  // ===================================
  // 6. Start Server
  // ===================================
  await app.listen(appConfigs().port);

  Logger.log(`🌐 Redis Host: ${redisConfigs().redisHost}`, 'Bootstrap');
  Logger.log(`🚀 Service started on port: ${appConfigs().port}`, 'Bootstrap');
  Logger.log(`📚 Swagger: http://localhost:${appConfigs().port}/api`, 'Bootstrap');
  Logger.log(`🔌 WebSocket: ws://localhost:${appConfigs().port}`, 'Bootstrap');
  Logger.log(`🔌 WebSocket Path: http://localhost:${appConfigs().port}/api/websocket`, 'Bootstrap');
}
bootstrap();