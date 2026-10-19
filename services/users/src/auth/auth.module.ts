import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { KeycloakModule } from '../keycloak/keycloak.module';
import { KeycloakJwtVerifier, PrismaModule } from '@ai-media/share';

@Module({
  imports: [KeycloakModule, PrismaModule],
  controllers: [AuthController],
  providers: [AuthService, KeycloakJwtVerifier],
})
export class AuthModule {}
