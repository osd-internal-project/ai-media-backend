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
import { ProjectModule } from './project/project.module';
import { LogsModule } from './logs/logs.module';
import { GalleryModule } from './gallery/gallery.module';
import { ProjectMemberModule } from './project-member/project-member.module';
import { MasteradataConfigApiModule } from './masteradata-config-api/masteradata-config-api.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { MinioClientModule } from './minio-client/minio-client.module';
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configs] }),
    PrismaModule,
    GenerateImageModule,
    HttpModule,
    ProjectModule,
    LogsModule,
    GalleryModule,
    ProjectMemberModule,
    MasteradataConfigApiModule,
    DashboardModule,
    MinioClientModule,
  ],
  controllers: [InventoryController, PublicController],
  providers: [InventoryService],
})
export class InventoryMainModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestLoggerMiddleware).forRoutes('*');
  }
}
