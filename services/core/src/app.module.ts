import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
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
import { PromptGuideModule } from './prompt-guide/prompt-guide.module';
import { PromptGuideTypeModule } from './prompt-guide-type/prompt-guide-type.module';
import { OmnihumenModule } from './omnihumen/omnihumen.module';
import { OmnihumenTaskModule } from './omnihumen-task/omnihumen-task.module';
import { ScheduleModule } from '@nestjs/schedule';
import { AiModelModule } from './ai-model/ai-model.module';
import { appConfigs, minioConfigs, byteplusConfigs, redisConfigs } from './configs';
import { PlanModule } from './plan/plan.module';
import { GenerateModule } from './generate/generate.module';
import { BullModule } from '@nestjs/bullmq';
import { WebsocketModule } from './websocket/websocket.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfigs, minioConfigs, byteplusConfigs],
    }),
    ScheduleModule.forRoot(),
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
    PromptGuideModule,
    PromptGuideTypeModule,
    OmnihumenModule,
    OmnihumenTaskModule,
    AiModelModule,
    PlanModule,
    EventEmitterModule.forRoot({ global: true }),
    GenerateModule,
    BullModule.forRoot({
      connection: {
        host: redisConfigs().redisHost || 'localhost',
        port: redisConfigs().redisPort || 6379,
        password: redisConfigs().redisPassword,
      },
    }),
    WebsocketModule,
  ],
  controllers: [InventoryController, PublicController],
  providers: [InventoryService],
})
export class InventoryMainModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestLoggerMiddleware).forRoutes('*');
  }
}
