import { Module } from '@nestjs/common';
import { OrganizationController } from './organization.controller';
import { OrganizationService } from './organization.service';
import { PrismaModule } from '@ai-media/share';
import { KeycloakModule } from '../keycloak/keycloak.module';
import { HttpModule } from '@nestjs/axios';

@Module({
  imports: [PrismaModule, KeycloakModule, HttpModule],
  controllers: [OrganizationController],
  providers: [OrganizationService],
})
export class OrganizationModule { }
