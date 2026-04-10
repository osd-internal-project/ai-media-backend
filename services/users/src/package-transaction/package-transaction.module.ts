import { Module } from '@nestjs/common';
import { PackageTransactionService } from './package-transaction.service';
import { PackageTransactionController } from './package-transaction.controller';
import { PrismaModule } from '@ai-media/share';

@Module({
    imports: [PrismaModule],
  controllers: [PackageTransactionController],
  providers: [PackageTransactionService],
  exports: [PackageTransactionService],
})
export class PackageTransactionModule {}
