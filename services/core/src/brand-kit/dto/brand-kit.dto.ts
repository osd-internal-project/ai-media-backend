import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

/** brand_kit.style — every field is optional; an empty one adds nothing to the prompt */
export class BrandKitStyleDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  mood?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  look?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  lighting?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  mustHave?: string[];
}

/** PATCH /brand-kit/:id — `default` and `organizationId` are never accepted here (use set-default) */
export class UpdateBrandKitDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  industryType?: string;

  @IsOptional()
  @IsString()
  brandCiPrompt?: string;

  @IsOptional()
  @IsString()
  negativePrompt?: string;

  @IsOptional()
  @IsString()
  customPrompt?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => BrandKitStyleDto)
  style?: BrandKitStyleDto;

  /** only the move to the composed prompt (2) is accepted; a kit never goes back to 1 */
  @IsOptional()
  @IsIn([2])
  promptVersion?: number;
}

export class CreateBrandKitDto extends UpdateBrandKitDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  organizationId: string;
}
