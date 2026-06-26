import { IsIn, IsNotEmpty, IsString } from 'class-validator';

export const PAYMENT_METHODS = [
  'CARD',
  'PROMPTPAY',
  'INTERNET_BANKING',
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export class CreateInvoiceDto {
  @IsString()
  @IsNotEmpty()
  organizationId: string;

  @IsString()
  @IsNotEmpty()
  userId: string;

  @IsString()
  @IsNotEmpty()
  billingProfileId: string;

  @IsString()
  @IsNotEmpty()
  planPriceId: string;

  @IsIn(PAYMENT_METHODS)
  paymentMethod: PaymentMethod;
}
