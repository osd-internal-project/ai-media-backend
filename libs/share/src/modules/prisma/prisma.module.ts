import { Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { AccessService } from 'src/access';
import {
  GenerateImageRepository,
  MasterdataModelTypeRepository,
} from 'src/repositories';

const services = [
  PrismaService,
  AccessService,
  GenerateImageRepository,
  MasterdataModelTypeRepository,
];

@Module({
  providers: [...services],
  exports: [...services],
})
export class PrismaModule {}
