import { Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { AccessService } from 'src/access';
import {
  GenerateImageRepository,
  MasterdataModelTypeRepository,
  UsersRepository,
  GroupsRepository,
  RolesRepository,
} from 'src/repositories';

const services = [
  PrismaService,
  AccessService,
  GenerateImageRepository,
  MasterdataModelTypeRepository,
  UsersRepository,
  GroupsRepository,
  RolesRepository,
];

@Module({
  providers: [...services],
  exports: [...services],
})
export class PrismaModule { }
