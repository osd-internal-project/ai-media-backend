import { Controller, Get, Param, Post } from '@nestjs/common';
import { OrganizationSubscriptionService } from './organization-subscription.service';

@Controller('organization-subscription')
export class OrganizationSubscriptionController {
  constructor(
    private readonly organizationSubscriptionService: OrganizationSubscriptionService,
  ) {}

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.organizationSubscriptionService.findOne(id);
  }

  @Get('organization/:organizationId')
  findByOrganizationId(@Param('organizationId') organizationId: string) {
    return this.organizationSubscriptionService.findByOrganizationId(organizationId);
  }

  @Post('renew/:organizationId')
  renewSubscription(@Param('organizationId') organizationId: string) {
    return this.organizationSubscriptionService.renewSubscription(organizationId);
  }
}
