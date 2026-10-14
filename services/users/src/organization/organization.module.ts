import { Module } from '@nestjs/common';
import { OrganizationController } from './organization.controller';
import { OrganizationService } from './organization.service';
import {
  LlmGatewayModule,
  PrismaModule,
  PrismaTransactionService,
} from '@ai-media/share';
import { KeycloakModule } from '../keycloak/keycloak.module';
import { HttpModule } from '@nestjs/axios';
import { OrganizationBulkMemberService } from './organization-bulk-member.service';

@Module({
  imports: [PrismaModule, LlmGatewayModule, KeycloakModule, HttpModule],
  controllers: [OrganizationController],
  providers: [
    OrganizationService,
    OrganizationBulkMemberService,
    PrismaTransactionService,
  ],
})
export class OrganizationModule { }
