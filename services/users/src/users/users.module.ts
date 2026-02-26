import { Module, forwardRef } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { KeycloakModule } from '../keycloak/keycloak.module';
import { PrismaModule } from '@ai-media/share';
import { HttpModule } from '@nestjs/axios';

@Module({
  imports: [PrismaModule, forwardRef(() => KeycloakModule), HttpModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule { }
