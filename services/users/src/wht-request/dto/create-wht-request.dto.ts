import {
  IsIn,
  IsISO8601,
  IsNotEmpty,
  IsString,
} from 'class-validator';

/** Only 1% and 3% withholding rates are supported. */
export const WHT_PERCENTS = [1, 3] as const;
export type WhtPercent = (typeof WHT_PERCENTS)[number];

export class CreateWhtRequestDto {
  @IsString()
  @IsNotEmpty()
  invoiceId: string;

  @IsIn(WHT_PERCENTS)
  whtPercent: WhtPercent;

  @IsString()
  @IsNotEmpty()
  docRefNo: string;

  @IsISO8601()
  docRefDate: string;

  // bank account for the refund (all required)
  @IsString()
  @IsNotEmpty()
  bankAccountName: string;

  @IsString()
  @IsNotEmpty()
  bankName: string;

  @IsString()
  @IsNotEmpty()
  bankAccountNumber: string;

  @IsString()
  @IsNotEmpty()
  bankBranchCode: string;
}
