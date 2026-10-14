import { Module } from '@nestjs/common';
import { PrismaModule } from '@ai-media/share';
import { PaymentMethodController } from './payment-method.controller';
import { PaymentMethodService } from './payment-method.service';
import { OmiseModule } from '../omise/omise.module';

@Module({
  imports: [PrismaModule, OmiseModule],
  controllers: [PaymentMethodController],
  providers: [PaymentMethodService],
  exports: [PaymentMethodService],
})
export class PaymentMethodModule {}
