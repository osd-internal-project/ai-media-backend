import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export const INTERNET_BANKS = ['bay', 'bbl', 'kbank', 'ktb', 'scb'] as const;
export type InternetBank = (typeof INTERNET_BANKS)[number];

/** Body for POST /invoice/:id/pay/card */
export class PayCardDto {
  @IsString()
  @IsNotEmpty()
  token: string;
}

/** Body for POST /invoice/:id/pay/source (PromptPay / internet banking) */
export class PaySourceDto {
  @IsIn(['PROMPTPAY', 'INTERNET_BANKING'])
  method: 'PROMPTPAY' | 'INTERNET_BANKING';

  // required only for internet banking
  @IsOptional()
  @IsIn(INTERNET_BANKS)
  bank?: InternetBank;

  @IsOptional()
  @IsString()
  returnUri?: string;
}
