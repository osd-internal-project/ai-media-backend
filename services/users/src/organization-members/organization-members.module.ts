import { Module } from '@nestjs/common';
import { OrganizationMembersController } from './organization-members.controller';
import { OrganizationMembersService } from './organization-members.service';
import { PrismaModule } from '@ai-media/share';

@Module({
  imports: [PrismaModule],
  controllers: [OrganizationMembersController],
  providers: [OrganizationMembersService],
})
export class OrganizationMembersModule {}
