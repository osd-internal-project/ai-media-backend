import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

export const BRAND_KIT_DETAIL_TYPES = [
  'colors',
  'typography',
  'logo',
  'style_ref',
];

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

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  includeInPrompt?: boolean;
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
