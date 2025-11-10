import { Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { AccessService } from 'src/access';

const services = [PrismaService, AccessService];

@Module({
  providers: [...services],
  exports: [...services],
})
export class PrismaModule {}
