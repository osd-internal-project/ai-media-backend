import { Controller, Get, Param, Query } from '@nestjs/common';
import { CustomerService } from './customer.service';

@Controller('customer')
export class CustomerController {
  constructor(private readonly customerService: CustomerService) {}

  @Get()
  findMany(
    @Query() query: { search?: string; skip?: string; take?: string },
  ) {
    return this.customerService.findMany(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.customerService.findOne(id);
  }

  @Get(':id/invoices')
  findInvoices(@Param('id') id: string) {
    return this.customerService.findInvoices(id);
  }
}
