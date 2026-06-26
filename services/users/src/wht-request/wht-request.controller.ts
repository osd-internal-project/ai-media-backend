import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { WhtRequestService } from './wht-request.service';
import { CreateWhtRequestDto } from './dto/create-wht-request.dto';
import { UpdateWhtStatusDto } from './dto/update-wht-status.dto';

@Controller('wht-request')
export class WhtRequestController {
  constructor(private readonly whtRequestService: WhtRequestService) {}

  @Get('eligible-invoices')
  eligibleInvoices(@Query('organizationId') organizationId: string) {
    return this.whtRequestService.eligibleInvoices(organizationId);
  }

  @Post()
  create(@Body() dto: CreateWhtRequestDto) {
    return this.whtRequestService.create(dto);
  }

  @Get()
  findMany(
    @Query()
    query: {
      status?: string;
      search?: string;
      startDate?: string;
      endDate?: string;
      skip?: string;
      take?: string;
    },
  ) {
    return this.whtRequestService.findManyAdmin(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.whtRequestService.findOne(id);
  }

  @Patch(':id/status')
  updateStatus(@Param('id') id: string, @Body() dto: UpdateWhtStatusDto) {
    return this.whtRequestService.updateStatus(id, dto);
  }
}
