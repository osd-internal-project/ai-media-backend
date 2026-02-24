import { Module, forwardRef } from '@nestjs/common';
import { KeycloakService } from './keycloak.service';
import { PrismaModule } from '@ai-media/share';
import { UsersModule } from 'src/users/users.module';

@Module({
    imports: [PrismaModule, forwardRef(() => UsersModule)],
    providers: [KeycloakService],
    exports: [KeycloakService],
})
export class KeycloakModule { }
