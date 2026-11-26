import { Module } from '@nestjs/common';
import { OrganizationMembersController } from './organization-members.controller';
import { OrganizationMembersService } from './organization-members.service';
import { PrismaModule } from '@ai-media/share';
import { OrganizationSeatService } from '../organization/organization-seat.service';

@Module({
  imports: [PrismaModule],
  controllers: [OrganizationMembersController],
  providers: [OrganizationMembersService, OrganizationSeatService],
})
export class OrganizationMembersModule {}
