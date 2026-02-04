import { Module } from '@nestjs/common';
import { KeycloakService } from './keycloak.service';
import { PrismaModule } from '@ai-media/share';

@Module({
    imports: [PrismaModule],
    providers: [KeycloakService],
    exports: [KeycloakService],
})
export class KeycloakModule { }
