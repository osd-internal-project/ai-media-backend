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
];

@Module({
  providers: [...services],
  exports: [...services],
})
export class PrismaModule {}
