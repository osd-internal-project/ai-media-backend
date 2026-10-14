import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ChatAssistantController } from './app.controller';
import { ChatAssistantService } from './app.service';
import { PrismaModule } from '@ai-media/share';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { RequestLoggerMiddleware } from './middleware/request-logger.middleware';
import { ChatModule } from './chat/chat.module';
import { ChatModelModule } from './chat-model/chat-model.module';
import { ConversationModule } from './conversation/conversation.module';
import { LlmStatusModule } from './llm-status/llm-status.module';
import appConfig from './configs';
import { KeycloakAuthModule } from '@ai-media/share';

// ScheduleModule ถูกถอดออก — service นี้ไม่มี @Cron อยู่เลย การลงทะเบียนไว้เฉย ๆ
// ทำให้อ่านโค้ดแล้วเข้าใจผิดว่ามีงานตามเวลาทำงานอยู่
@Module({
  imports: [
    // ตรวจ Keycloak token ทุก route ตาม AUTH_MODE (off | report | enforce)
    KeycloakAuthModule,
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig],
    }),
    PrismaModule,
    HttpModule,
    ChatModule,
    ChatModelModule,
    ConversationModule,
    LlmStatusModule,
  ],
  controllers: [ChatAssistantController],
  providers: [ChatAssistantService],
})
export class ChatAssistantMainModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestLoggerMiddleware).forRoutes('*');
  }
}
