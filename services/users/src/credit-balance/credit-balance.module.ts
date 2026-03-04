import { Module } from '@nestjs/common';
import { CreditBalanceService } from './credit-balance.service';
import { CreditBalanceController } from './credit-balance.controller';
import { PrismaModule } from '@ai-media/share';

@Module({
  imports: [PrismaModule],
  controllers: [CreditBalanceController],
  providers: [CreditBalanceService],
//   exports: [CreditBalanceService],
})
export class CreditBalanceModule {}
