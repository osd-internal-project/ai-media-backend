import configs from './configs';
import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { InventoryController } from './app.controller';
import { InventoryService } from './app.service';
import { RequestLoggerMiddleware } from './middleware/request-logger.middleware';
import { PublicController } from './public/public.controller';
import { PrismaModule } from '@ai-media/share';
import { HttpModule } from '@nestjs/axios';
import { UsersModule } from './users/users.module';
import { GroupsModule } from './groups/groups.module';
import { RolesModule } from './roles/roles.module';
@Module({
  imports: [PrismaModule, HttpModule, UsersModule, GroupsModule, RolesModule],
  controllers: [InventoryController, PublicController],
  providers: [InventoryService],
})
export class InventoryMainModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestLoggerMiddleware).forRoutes('*');
  }
}
