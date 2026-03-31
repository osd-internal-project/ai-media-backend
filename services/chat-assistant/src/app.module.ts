import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ChatAssistantController } from './app.controller';
import { ChatAssistantService } from './app.service';
import { PrismaModule } from '@ai-media/share';
import { HttpModule } from '@nestjs/axios';
import { ScheduleModule } from '@nestjs/schedule';
import { ConfigModule } from '@nestjs/config';
import { RequestLoggerMiddleware } from './middleware/request-logger.middleware';
import { ChatModule } from './chat/chat.module';
import { ConversationModule } from './conversation/conversation.module';
import appConfig from './configs';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig],
    }),
    PrismaModule,
    HttpModule,
    ScheduleModule.forRoot(),
    ChatModule,
    ConversationModule,
  ],
  controllers: [ChatAssistantController],
  providers: [ChatAssistantService],
})
export class ChatAssistantMainModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestLoggerMiddleware).forRoutes('*');
  }
}
