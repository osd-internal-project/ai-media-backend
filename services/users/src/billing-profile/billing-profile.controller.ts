import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { BillingProfileService } from './billing-profile.service';
import { CreateBillingProfileDto } from './dto/create-billing-profile.dto';
import { UpdateBillingProfileDto } from './dto/update-billing-profile.dto';

@Controller('billing-profile')
export class BillingProfileController {
  constructor(
    private readonly billingProfileService: BillingProfileService,
  ) {}

  @Post()
  create(@Body() dto: CreateBillingProfileDto) {
    return this.billingProfileService.create(dto);
  }

  @Get()
  findMany(
    @Query('userId') userId?: string,
    @Query('organizationId') organizationId?: string,
  ) {
    if (userId) return this.billingProfileService.findByUserId(userId);
    if (organizationId)
      return this.billingProfileService.findByOrganizationId(organizationId);
    return [];
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.billingProfileService.findOne(id);
  }

  @Patch(':id/default')
  setDefault(@Param('id') id: string) {
    return this.billingProfileService.setDefault(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateBillingProfileDto) {
    return this.billingProfileService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.billingProfileService.remove(id);
  }
}
