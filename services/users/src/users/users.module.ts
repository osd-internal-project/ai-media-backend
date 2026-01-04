import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { KeycloakModule } from '../keycloak/keycloak.module';
import { PrismaModule } from '@ai-media/share';

@Module({
  imports: [PrismaModule, KeycloakModule],
  controllers: [UsersController],
  providers: [UsersService],
})
export class UsersModule { }
