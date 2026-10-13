import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from '../modules/prisma/prisma.module';
import { KeycloakAuthGuard } from './keycloak-auth.guard';
import { KeycloakAuthService } from './keycloak-auth.service';
import { KeycloakJwtVerifier } from './keycloak-jwt.verifier';

/**
 * import ใน AppModule ของแต่ละ service ครั้งเดียว — ลง KeycloakAuthGuard เป็น guard ทุก route
 * Global เพื่อให้ module อื่น (เช่น websocket) inject KeycloakAuthService ได้โดยไม่ import ซ้ำ (guard จะซ้ำ)
 */
@Global()
@Module({
  imports: [PrismaModule],
  providers: [
    KeycloakJwtVerifier,
    KeycloakAuthService,
    { provide: APP_GUARD, useClass: KeycloakAuthGuard },
  ],
  exports: [KeycloakAuthService],
})
export class KeycloakAuthModule {}
