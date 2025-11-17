import { Module } from '@nestjs/common';
import { ProjectMemberService } from './project-member.service';
import { ProjectMemberController } from './project-member.controller';

@Module({
  controllers: [ProjectMemberController],
  providers: [ProjectMemberService]
})
export class ProjectMemberModule {}
