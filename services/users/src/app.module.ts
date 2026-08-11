import configs from './configs';
import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { InventoryController } from './app.controller';
import { InventoryService } from './app.service';
import { RequestLoggerMiddleware } from './middleware/request-logger.middleware';
import { PublicController } from './public/public.controller';
import { PrismaModule } from '@ai-media/share';
import { HttpModule } from '@nestjs/axios';
import { UsersModule } from './users/users.module';
import { GroupsModule } from './groups/groups.module';
import { RolesModule } from './roles/roles.module';
import { RolesOfGroupsModule } from './roles-of-groups/roles-of-groups.module';
import { UsersOfGroupsModule } from './users-of-groups/users-of-groups.module';
import { OrganizationModule } from './organization/organization.module';
import { OrganizationMembersModule } from './organization-members/organization-members.module';
import { KeycloakModule } from './keycloak/keycloak.module';
import { AuthModule } from './auth/auth.module';
import { OrganizationSubscriptionModule } from './organization-subscription/organization-subscription.module';
import { PackageTransactionModule } from './package-transaction/package-transaction.module';
import { CreditBalanceModule } from './credit-balance/credit-balance.module';
import { ScheduleModule } from '@nestjs/schedule';
import { CouponCodeModule } from './coupon-code/coupon-code.module';
import { BillingProfileModule } from './billing-profile/billing-profile.module';
import { InvoiceModule } from './invoice/invoice.module';
import { WhtRequestModule } from './wht-request/wht-request.module';
import { CustomerModule } from './customer/customer.module';
import { PurchaseModule } from './purchase/purchase.module';
import { PaymentMethodModule } from './payment-method/payment-method.module';
import { SocialAccountModule } from './social-account/social-account.module';

@Module({
  imports: [
    PrismaModule,
    HttpModule,
    ScheduleModule.forRoot(),
    UsersModule,
    GroupsModule,
    RolesModule,
    RolesOfGroupsModule,
    UsersOfGroupsModule,
    OrganizationModule,
    OrganizationMembersModule,
    KeycloakModule,
    AuthModule,
    OrganizationSubscriptionModule,
    PackageTransactionModule,
    CreditBalanceModule,
    CouponCodeModule,
    BillingProfileModule,
    InvoiceModule,
    WhtRequestModule,
    CustomerModule,
    PurchaseModule,
    PaymentMethodModule,
    SocialAccountModule,
  ],
  controllers: [InventoryController, PublicController],
  providers: [InventoryService],
})
export class InventoryMainModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestLoggerMiddleware).forRoutes('*');
  }
}
