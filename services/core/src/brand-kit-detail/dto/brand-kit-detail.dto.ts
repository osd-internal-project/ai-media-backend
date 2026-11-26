import {
  IsIn,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export const BRAND_KIT_DETAIL_TYPES = ['colors', 'typography', 'logo'];

/** PATCH /brand-kit-detail/:id — a detail never moves to another kit, so `brandKitId` is not accepted */
export class UpdateBrandKitDetailDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsIn(BRAND_KIT_DETAIL_TYPES)
  type?: string;

  @IsOptional()
  @IsObject()
  detail?: Record<string, unknown>;
}

export class CreateBrandKitDetailDto extends UpdateBrandKitDetailDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @IsIn(BRAND_KIT_DETAIL_TYPES)
  type: string;

  @IsUUID()
  brandKitId: string;
}
