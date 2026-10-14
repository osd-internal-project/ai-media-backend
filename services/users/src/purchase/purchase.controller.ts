import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { BillingEnabledGuard } from '../billing/billing-enabled.guard';
import { PurchaseService } from './purchase.service';
import { CreatePurchaseDto } from './dto/create-purchase.dto';
import {
  PayPurchaseCardDto,
  PayPurchaseSourceDto,
} from './dto/pay-purchase.dto';

@Controller('purchase')
export class PurchaseController {
  constructor(private readonly purchaseService: PurchaseService) {}

  @Post()
  @UseGuards(BillingEnabledGuard)
  create(@Body() dto: CreatePurchaseDto) {
    return this.purchaseService.create(dto);
  }

  @Get(':id/status')
  getStatus(@Param('id') id: string) {
    return this.purchaseService.getStatus(id);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.purchaseService.findOne(id);
  }

  @Post(':id/pay/card')
  @UseGuards(BillingEnabledGuard)
  payCard(@Param('id') id: string, @Body() dto: PayPurchaseCardDto) {
    return this.purchaseService.payCard(id, dto);
  }

  @Post(':id/pay/source')
  @UseGuards(BillingEnabledGuard)
  paySource(@Param('id') id: string, @Body() dto: PayPurchaseSourceDto) {
    return this.purchaseService.paySource(id, dto);
  }
}
