import { Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { AccessService } from 'src/access';
import {
  GenerateImageRepository,
  MasterdataModelTypeRepository,
  UsersRepository,
  GroupsRepository,
  RolesRepository,
  GalleryRepository,
  ProjectMemberRepository,
  ProjectRepository,
  LogRepository,
  MasterDataConfigApiRepository,
  PromptGuideRepository,
  PromptGuideTypeRepository,
  OmnihumenTaskRepository,
  OrganizationRepository,
  OrganizationMemberRepository,
  InvitationRepository,
  ErrorLogRepository,
  AuditLogRepository,
  PlanRepository,
  RequestChangePasswordRepository,
} from 'src/repositories';

const services = [
  PrismaService,
  AccessService,
  GenerateImageRepository,
  MasterdataModelTypeRepository,
  UsersRepository,
  GroupsRepository,
  RolesRepository,
  GalleryRepository,
  ProjectMemberRepository,
  ProjectRepository,
  LogRepository,
  MasterDataConfigApiRepository,
  PromptGuideRepository,
  PromptGuideTypeRepository,
  OmnihumenTaskRepository,
  OrganizationRepository,
  OrganizationMemberRepository,
  InvitationRepository,
  ErrorLogRepository,
  AuditLogRepository,
  PlanRepository,
  RequestChangePasswordRepository,
];

@Module({
  providers: [...services],
  exports: [...services],
})
export class PrismaModule {}
