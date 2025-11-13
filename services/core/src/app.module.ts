import configs from './configs';
import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { InventoryController } from './app.controller';
import { InventoryService } from './app.service';
import { RequestLoggerMiddleware } from './middleware/request-logger.middleware';
import { PublicController } from './public/public.controller';
import { PrismaModule } from '@ai-media/share';
import { GenerateImageModule } from './generate-image/generate-image.module';
import { HttpModule } from '@nestjs/axios';
@Module({
  imports: [PrismaModule, GenerateImageModule, HttpModule],
  controllers: [InventoryController, PublicController],
  providers: [InventoryService],
})
export class InventoryMainModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestLoggerMiddleware).forRoutes('*');
  }
}
