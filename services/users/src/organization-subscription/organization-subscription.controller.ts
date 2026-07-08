import { Body, Controller, Get, Param, Post } from '@nestjs/common';
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
    return this.organizationSubscriptionService.findByOrganizationId(
      organizationId,
    );
  }

  @Post('restart/:organizationId')
  restartSubscription(@Param('organizationId') organizationId: string) {
    return this.organizationSubscriptionService.restartSubscription(
      organizationId,
    );
  }

  @Post('downgrade/:organizationId')
  downgradeSubscription(
    @Param('organizationId') organizationId: string,
    @Body() body: { priceId: string },
  ) {
    return this.organizationSubscriptionService.downgradeSubscription(
      organizationId,
      body.priceId,
    );
  }

  @Post('upgrade/:organizationId')
  upgradeSubscription(
    @Param('organizationId') organizationId: string,
    @Body() body: { priceId: string },
  ) {
    return this.organizationSubscriptionService.upgradeSubscription(
      organizationId,
      body.priceId,
    );
  }

  @Post('cancel/:organizationId')
  cancelSubscription(@Param('organizationId') organizationId: string) {
    return this.organizationSubscriptionService.cancelSubscription(
      organizationId,
    );
  }
}
