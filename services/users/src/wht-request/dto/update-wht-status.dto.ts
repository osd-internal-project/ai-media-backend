import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export const WHT_STATUSES = [
  'PENDING',
  'RECEIVED',
  'VERIFIED',
  'REJECTED',
  'REFUNDED',
] as const;
export type WhtStatus = (typeof WHT_STATUSES)[number];

export class UpdateWhtStatusDto {
  @IsIn(WHT_STATUSES)
  toStatus: WhtStatus;

  @IsString()
  @IsNotEmpty()
  adminUserId: string;

  @IsOptional()
  @IsString()
  note?: string;
}
