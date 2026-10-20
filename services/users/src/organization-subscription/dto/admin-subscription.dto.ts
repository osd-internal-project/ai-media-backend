import { IsIn, IsString } from 'class-validator';

export const CANCEL_MODES = ['end_of_period', 'immediate'] as const;
export type CancelMode = (typeof CANCEL_MODES)[number];

export class AdminChangePackageDto {
  @IsString()
  priceId: string;
}

export class AdminCancelDto {
  @IsIn(CANCEL_MODES)
  mode: CancelMode;
}
