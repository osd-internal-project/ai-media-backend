import { Type } from 'class-transformer';
import {
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Length,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { BILLING_PROFILE_TYPES, BillingProfileType } from '../../billing-profile/dto/create-billing-profile.dto';
import { PAYMENT_METHODS, PaymentMethod } from '../../invoice/dto/create-invoice.dto';

/** Organization details captured before payment (org is created on success). */
export class PurchaseOrgDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  type?: string;
}

/** Tax-invoice details captured before payment (snapshot, validated by type). */
export class PurchaseBillingDto {
  @IsIn(BILLING_PROFILE_TYPES)
  type: BillingProfileType;

  @IsString()
  @IsNotEmpty()
  address: string;

  @ValidateIf((o: PurchaseBillingDto) => o.type === 'INDIVIDUAL')
  @IsString()
  @IsNotEmpty()
  fullName?: string;

  @ValidateIf((o: PurchaseBillingDto) => o.type === 'INDIVIDUAL')
  @IsString()
  @Length(13, 13, { message: 'nationalId must be 13 digits' })
  nationalId?: string;

  @ValidateIf((o: PurchaseBillingDto) => o.type === 'JURISTIC')
  @IsString()
  @IsNotEmpty()
  companyName?: string;

  @ValidateIf((o: PurchaseBillingDto) => o.type === 'JURISTIC')
  @IsString()
  @Length(13, 13, { message: 'taxId must be 13 digits' })
  taxId?: string;

  @ValidateIf((o: PurchaseBillingDto) => o.type === 'JURISTIC')
  @IsString()
  @IsNotEmpty()
  branchCode?: string;

  @ValidateIf((o: PurchaseBillingDto) => o.type === 'JURISTIC')
  @IsString()
  @IsOptional()
  branchName?: string;

  @ValidateIf((o: PurchaseBillingDto) => o.type === 'JURISTIC')
  @IsString()
  @IsNotEmpty()
  contactName?: string;

  @ValidateIf((o: PurchaseBillingDto) => o.type === 'JURISTIC')
  @IsString()
  @IsNotEmpty()
  phone?: string;

  @ValidateIf((o: PurchaseBillingDto) => o.type === 'JURISTIC')
  @IsEmail()
  email?: string;
}

export class CreatePurchaseDto {
  @IsString()
  @IsNotEmpty()
  userId: string;

  @IsString()
  @IsNotEmpty()
  planPriceId: string;

  // Optional here — the actual method is chosen on the /payment step and
  // recorded by the pay endpoint. Defaults to CARD.
  @IsOptional()
  @IsIn(PAYMENT_METHODS)
  paymentMethod?: PaymentMethod;

  @IsObject()
  @ValidateNested()
  @Type(() => PurchaseOrgDto)
  org: PurchaseOrgDto;

  @IsObject()
  @ValidateNested()
  @Type(() => PurchaseBillingDto)
  billing: PurchaseBillingDto;
}
