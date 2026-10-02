import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class LlmStatusQueryDto {
  @ApiProperty({ description: 'Organization ID whose gateway key is inspected' })
  @IsString()
  @MinLength(1)
  organizationId: string;

  @ApiProperty({
    description:
      'Caller. Must be a member of the organization — key status is not public.',
  })
  @IsString()
  @MinLength(1)
  userId: string;

  @ApiPropertyOptional({
    description: 'Model id to inspect. Falls back to the default chat model.',
    example: 'llama3.3-70b',
  })
  @IsString()
  @IsOptional()
  model?: string;

  @ApiPropertyOptional({
    description:
      'Send a 1-token request to prove the org key works against the model endpoint. Off by default.',
    default: false,
  })
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  @IsOptional()
  probe?: boolean;
}
