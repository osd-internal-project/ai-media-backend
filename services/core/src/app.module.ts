import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ConfigModule } from '@nestjs/config';
import { InventoryController } from './app.controller';
import { InventoryService } from './app.service';
import { RequestLoggerMiddleware } from './middleware/request-logger.middleware';
import { PrismaModule } from '@ai-media/share';
import { HttpModule } from '@nestjs/axios';
import { ProjectModule } from './project/project.module';
import { LogsModule } from './logs/logs.module';
import { GalleryModule } from './gallery/gallery.module';
import { ActivityShareModule } from './activity-share/activity-share.module';
import { CommunityPostModule } from './community-post/community-post.module';
import { PublicCommunityModule } from './public-community/public-community.module';
import { ProjectMemberModule } from './project-member/project-member.module';
import { MasteradataConfigApiModule } from './masteradata-config-api/masteradata-config-api.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { PromptGuideModule } from './prompt-guide/prompt-guide.module';
import { PromptGuideTypeModule } from './prompt-guide-type/prompt-guide-type.module';
import { ScheduleModule } from '@nestjs/schedule';
import { AiModelModule } from './ai-model/ai-model.module';
import {
  appConfigs,
  byteplusConfigs,
  communityConfigs,
  redisConfigs,
} from './configs';
import { PlanModule } from './plan/plan.module';
import { GenerateModule } from './generate/generate.module';
import { BullModule } from '@nestjs/bullmq';
import { WebsocketModule } from './websocket/websocket.module';
import { MasterModelTypeModule } from './master-model-type/master-model-type.module';
import { BrandKitModule } from './brand-kit/brand-kit.module';
import { BrandKitDetailModule } from './brand-kit-detail/brand-kit-detail.module';
import { BrandKitDetailTypeModule } from './brand-kit-detail-type/brand-kit-detail-type.module';
import { ContactSaleLogModule } from './contact-sale-log/contact-sale-log.module';
import { WorkflowModule } from './workflow/workflow.module';
import { PhotoEventModule } from './photo-event/photo-event.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfigs, byteplusConfigs, communityConfigs],
    }),
    ScheduleModule.forRoot(),
    WebsocketModule,
    PrismaModule,
    HttpModule,
    ProjectModule,
    LogsModule,
    GalleryModule,
    ActivityShareModule,
    CommunityPostModule,
    PublicCommunityModule,
    ProjectMemberModule,
    MasteradataConfigApiModule,
    MasterModelTypeModule,
    BrandKitModule,
    BrandKitDetailModule,
    BrandKitDetailTypeModule,
    DashboardModule,
    PromptGuideModule,
    PromptGuideTypeModule,
    AiModelModule,
    PlanModule,
    EventEmitterModule.forRoot({ global: true }),
    GenerateModule,
    BullModule.forRoot({
      connection: {
        host: redisConfigs().redisHost,
        port: redisConfigs().redisPort,
        password: redisConfigs().redisPassword,
      },
    }),
    ContactSaleLogModule,
    WorkflowModule,
    PhotoEventModule,
  ],
  controllers: [InventoryController],
  providers: [InventoryService],
})
export class InventoryMainModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestLoggerMiddleware).forRoutes('*');
  }
}
