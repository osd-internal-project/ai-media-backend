import { Controller, Get, Param, Patch, Body } from '@nestjs/common';
import { CreditBalanceService } from './credit-balance.service';

@Controller('credit-balance')
export class CreditBalanceController {
  constructor(private readonly creditBalanceService: CreditBalanceService) {}

  @Get('organization/:organizationId')
  findByOrganizationId(@Param('organizationId') organizationId: string) {
    console.log(organizationId);
    return this.creditBalanceService.findByOrganizationId(organizationId);
  }
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.creditBalanceService.findOne(id);
  }

  @Patch('organization/:organizationId/extra-coin')
  updateExtraCoin(
    @Param('organizationId') organizationId: string,
    @Body() data: { onTopBalance?: number; onTopImage?: number },
  ) {
    return this.creditBalanceService.updateExtraCoin(organizationId, data);
  }
}
