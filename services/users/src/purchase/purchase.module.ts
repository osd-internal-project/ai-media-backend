import { Module } from '@nestjs/common';
import { PrismaModule } from '@ai-media/share';
import { PurchaseService } from './purchase.service';
import { PurchaseController } from './purchase.controller';
import { OmiseModule } from '../omise/omise.module';
import { DocumentNumberModule } from '../document-number/document-number.module';

@Module({
  imports: [PrismaModule, OmiseModule, DocumentNumberModule],
  controllers: [PurchaseController],
  providers: [PurchaseService],
  exports: [PurchaseService],
})
export class PurchaseModule {}
