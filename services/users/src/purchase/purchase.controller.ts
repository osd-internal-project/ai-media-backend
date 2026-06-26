import { Body, Controller, Get, Param, Post } from '@nestjs/common';
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
  payCard(@Param('id') id: string, @Body() dto: PayPurchaseCardDto) {
    return this.purchaseService.payCard(id, dto);
  }

  @Post(':id/pay/source')
  paySource(@Param('id') id: string, @Body() dto: PayPurchaseSourceDto) {
    return this.purchaseService.paySource(id, dto);
  }
}
