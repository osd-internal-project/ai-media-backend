import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { INTERNET_BANKS, InternetBank } from '../../invoice/dto/pay-invoice.dto';

/** Body for POST /purchase/:id/pay/card */
export class PayPurchaseCardDto {
  @IsString()
  @IsNotEmpty()
  token: string;
}

/** Body for POST /purchase/:id/pay/source (PromptPay / internet banking) */
export class PayPurchaseSourceDto {
  @IsIn(['PROMPTPAY', 'INTERNET_BANKING'])
  method: 'PROMPTPAY' | 'INTERNET_BANKING';

  @IsOptional()
  @IsIn(INTERNET_BANKS)
  bank?: InternetBank;

  @IsOptional()
  @IsString()
  returnUri?: string;
}
