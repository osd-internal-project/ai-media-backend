import { Controller, Get, Param } from '@nestjs/common';
import { PackageTransactionService } from './package-transaction.service';

@Controller('package-transaction')
export class PackageTransactionController {
  constructor(
    private readonly packageTransactionService: PackageTransactionService,
  ) {}

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.packageTransactionService.findOne(id);
  }

  @Get('organization/:organizationId')
  findByOrganizationId(@Param('organizationId') organizationId: string) {
    return this.packageTransactionService.findByOrganizationId(organizationId);
  }
}
