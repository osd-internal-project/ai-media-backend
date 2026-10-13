import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { BillingEnabledGuard } from '../billing/billing-enabled.guard';
import { InvoiceService } from './invoice.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { PayCardDto, PaySourceDto } from './dto/pay-invoice.dto';
import { PurchaseService } from '../purchase/purchase.service';
import { Public } from '@ai-media/share';

@Controller('invoice')
export class InvoiceController {
  constructor(
    private readonly invoiceService: InvoiceService,
    private readonly purchaseService: PurchaseService,
  ) {}

  @Post()
  @UseGuards(BillingEnabledGuard)
  create(@Body() dto: CreateInvoiceDto) {
    return this.invoiceService.createInvoice(dto);
  }

  // Omise server-to-server webhook (public; no token expected).
  // Dispatches to both handlers — each is idempotent and keyed on its own
  // omiseChargeId, so calling both safely covers invoice top-ups and new-org
  // purchase orders.
  // Omise เรียกเข้ามา — ไม่มี token ของผู้ใช้
  @Public()
  @Post('webhook/omise')
  @UseGuards(BillingEnabledGuard)
  async webhook(@Body() event: Record<string, unknown>) {
    await this.invoiceService.handleWebhook(event);
    await this.purchaseService.handleWebhook(event);
    return { received: true };
  }

  // Admin list with filters
  @Get()
  findMany(
    @Query()
    query: {
      status?: string;
      startDate?: string;
      endDate?: string;
      search?: string;
      skip?: string;
      take?: string;
    },
  ) {
    return this.invoiceService.findManyAdmin(query);
  }

  @Get('organization/:organizationId')
  findByOrganization(@Param('organizationId') organizationId: string) {
    return this.invoiceService.findByOrganizationId(organizationId);
  }

  @Get(':id/status')
  getStatus(@Param('id') id: string) {
    return this.invoiceService.getStatus(id);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.invoiceService.findOne(id);
  }

  @Post(':id/pay/card')
  @UseGuards(BillingEnabledGuard)
  payCard(@Param('id') id: string, @Body() dto: PayCardDto) {
    return this.invoiceService.payCard(id, dto);
  }

  @Post(':id/pay/source')
  @UseGuards(BillingEnabledGuard)
  paySource(@Param('id') id: string, @Body() dto: PaySourceDto) {
    return this.invoiceService.paySource(id, dto);
  }
}
