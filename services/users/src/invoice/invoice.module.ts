import { Module } from '@nestjs/common';
import { PrismaModule } from '@ai-media/share';
import { InvoiceService } from './invoice.service';
import { InvoiceController } from './invoice.controller';
import { OmiseModule } from '../omise/omise.module';
import { DocumentNumberModule } from '../document-number/document-number.module';
import { PurchaseModule } from '../purchase/purchase.module';

@Module({
  imports: [PrismaModule, OmiseModule, DocumentNumberModule, PurchaseModule],
  controllers: [InvoiceController],
  providers: [InvoiceService],
  exports: [InvoiceService],
})
export class InvoiceModule {}
