import {
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateIf,
} from 'class-validator';

export const INTERNET_BANKS = ['bay', 'bbl', 'kbank', 'ktb', 'scb'] as const;
export type InternetBank = (typeof INTERNET_BANKS)[number];

/**
 * Body for POST /invoice/:id/pay/card. Provide either:
 * - `token` (single-use Omise token from a freshly-entered card), optionally
 *   with `saveCard: true` to store it as a saved card for the org; OR
 * - `cardId` to charge a previously-saved card of the org's Omise customer.
 */
export class PayCardDto {
  @ValidateIf((o: PayCardDto) => !o.cardId)
  @IsString()
  @IsNotEmpty()
  token?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  cardId?: string;

  @IsOptional()
  @IsBoolean()
  saveCard?: boolean;
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
