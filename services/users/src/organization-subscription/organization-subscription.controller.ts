import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { AuthUser, CurrentUser } from '@ai-media/share';
import { OrganizationSubscriptionService } from './organization-subscription.service';
import {
  AdminCancelDto,
  AdminChangePackageDto,
} from './dto/admin-subscription.dto';

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
  restartSubscription(
    @Param('organizationId') organizationId: string,
    @CurrentUser() authUser: AuthUser | undefined,
  ) {
    this.organizationSubscriptionService.assertSuperAdmin(authUser);
    return this.organizationSubscriptionService.restartSubscription(
      organizationId,
    );
  }

  @Post('downgrade/:organizationId')
  async downgradeSubscription(
    @Param('organizationId') organizationId: string,
    @Body() body: { priceId: string },
    @CurrentUser() authUser: AuthUser | undefined,
  ) {
    await this.organizationSubscriptionService.assertOrganizationManager(
      authUser,
      organizationId,
    );
    return this.organizationSubscriptionService.downgradeSubscription(
      organizationId,
      body.priceId,
    );
  }

  @Post('upgrade/:organizationId')
  upgradeSubscription(
    @Param('organizationId') organizationId: string,
    @Body() body: { priceId: string },
    @CurrentUser() authUser: AuthUser | undefined,
  ) {
    this.organizationSubscriptionService.assertSuperAdmin(authUser);
    return this.organizationSubscriptionService.upgradeSubscription(
      organizationId,
      body.priceId,
    );
  }

  @Post('cancel/:organizationId')
  async cancelSubscription(
    @Param('organizationId') organizationId: string,
    @CurrentUser() authUser: AuthUser | undefined,
  ) {
    await this.organizationSubscriptionService.assertOrganizationManager(
      authUser,
      organizationId,
    );
    return this.organizationSubscriptionService.cancelSubscription(
      organizationId,
    );
  }

  @Post('admin/renew/:organizationId')
  adminRenew(
    @Param('organizationId') organizationId: string,
    @CurrentUser() authUser: AuthUser | undefined,
  ) {
    this.organizationSubscriptionService.assertSuperAdmin(authUser);
    return this.organizationSubscriptionService.adminRenew(organizationId);
  }

  @Post('admin/change/:organizationId')
  adminChangePackage(
    @Param('organizationId') organizationId: string,
    @Body() body: AdminChangePackageDto,
    @CurrentUser() authUser: AuthUser | undefined,
  ) {
    this.organizationSubscriptionService.assertSuperAdmin(authUser);
    return this.organizationSubscriptionService.adminChangePackage(
      organizationId,
      body.priceId,
    );
  }

  @Post('admin/cancel/:organizationId')
  adminCancel(
    @Param('organizationId') organizationId: string,
    @Body() body: AdminCancelDto,
    @CurrentUser() authUser: AuthUser | undefined,
  ) {
    this.organizationSubscriptionService.assertSuperAdmin(authUser);
    return this.organizationSubscriptionService.adminCancel(
      organizationId,
      body.mode,
    );
  }

  @Post('admin/resume/:organizationId')
  adminResume(
    @Param('organizationId') organizationId: string,
    @CurrentUser() authUser: AuthUser | undefined,
  ) {
    this.organizationSubscriptionService.assertSuperAdmin(authUser);
    return this.organizationSubscriptionService.adminResume(organizationId);
  }
}
