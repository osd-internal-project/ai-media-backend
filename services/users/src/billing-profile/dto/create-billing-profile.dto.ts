import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  ValidateIf,
} from 'class-validator';

/** Billing profile types. Type-specific fields are validated conditionally. */
export const BILLING_PROFILE_TYPES = ['INDIVIDUAL', 'JURISTIC'] as const;
export type BillingProfileType = (typeof BILLING_PROFILE_TYPES)[number];

export class CreateBillingProfileDto {
  @IsString()
  @IsNotEmpty()
  userId: string;

  @IsString()
  @IsNotEmpty()
  organizationId: string;

  @IsIn(BILLING_PROFILE_TYPES)
  type: BillingProfileType;

  @IsString()
  @IsNotEmpty()
  address: string;

  @IsBoolean()
  @IsOptional()
  isDefault?: boolean;

  // ── Individual ──────────────────────────────────────────────
  @ValidateIf((o: CreateBillingProfileDto) => o.type === 'INDIVIDUAL')
  @IsString()
  @IsNotEmpty()
  fullName?: string;

  @ValidateIf((o: CreateBillingProfileDto) => o.type === 'INDIVIDUAL')
  @IsString()
  @Length(13, 13, { message: 'nationalId must be 13 digits' })
  nationalId?: string;

  // ── Juristic ────────────────────────────────────────────────
  @ValidateIf((o: CreateBillingProfileDto) => o.type === 'JURISTIC')
  @IsString()
  @IsNotEmpty()
  companyName?: string;

  @ValidateIf((o: CreateBillingProfileDto) => o.type === 'JURISTIC')
  @IsString()
  @Length(13, 13, { message: 'taxId must be 13 digits' })
  taxId?: string;

  @ValidateIf((o: CreateBillingProfileDto) => o.type === 'JURISTIC')
  @IsString()
  @IsNotEmpty()
  branchCode?: string;

  @ValidateIf((o: CreateBillingProfileDto) => o.type === 'JURISTIC')
  @IsString()
  @IsOptional()
  branchName?: string;

  @ValidateIf((o: CreateBillingProfileDto) => o.type === 'JURISTIC')
  @IsString()
  @IsNotEmpty()
  contactName?: string;

  @ValidateIf((o: CreateBillingProfileDto) => o.type === 'JURISTIC')
  @IsString()
  @IsNotEmpty()
  phone?: string;

  @ValidateIf((o: CreateBillingProfileDto) => o.type === 'JURISTIC')
  @IsEmail()
  email?: string;
}
