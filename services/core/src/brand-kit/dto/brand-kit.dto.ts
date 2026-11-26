import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

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
