import { Module } from '@nestjs/common';
import { AccessService } from './access.service';
import { PrismaService } from '../modules/prisma/prisma.service';
@Module({
  providers: [AccessService, PrismaService],
  exports: [AccessService, PrismaService],
})
export class AccessModule {}
