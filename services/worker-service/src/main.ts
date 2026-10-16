// ต้อง import ก่อน @nestjs/* และ express — instrumentation patch ได้เฉพาะ module ที่ยังไม่ถูกโหลด
import './tracing';
import { NestFactory } from '@nestjs/core';
import { OtelLogger } from '@ai-media/share';
import { WorkerServiceModule } from './app.module';
import { appConfigs } from './configs';
import { Logger } from '@nestjs/common';
import helmet from 'helmet';

async function bootstrap() {
  (BigInt.prototype as any).toJSON = function () {
    return this.toString();
  };
  // เติม trace_id ใน log เพื่อกดจาก log ใน Grafana ไป trace ใน Tempo
  const app = await NestFactory.create(WorkerServiceModule, {
    logger: new OtelLogger(),
  });
  // app.setGlobalPrefix('api');
  app.enableCors({
    origin: ['http://localhost:3000', 'http://localhost:4002', '*'], // ระบุ origins ที่อนุญาต
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
  });
  app.setGlobalPrefix('api');
  // ===================================
  // 2. Helmet Configuration (แก้ไขให้รองรับ WebSocket)
  // ===================================
  app.use(
    helmet({
      contentSecurityPolicy: false, // ปิด CSP หรือปรับแต่งให้รองรับ WebSocket
      crossOriginEmbedderPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );

  await app.listen(appConfigs().port);
  Logger.log(`port ${appConfigs().port}`, '🚀 Worker Service is listening for jobs...');
}
bootstrap();