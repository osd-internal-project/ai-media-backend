import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateConversationDto {
  @ApiProperty({ description: 'User ID', example: 'user-uuid-123' })
  @IsString()
  @MinLength(1)
  userId: string;

  @ApiPropertyOptional({ description: 'Conversation title', example: 'My first chat' })
  @IsString()
  @MaxLength(300)
  @IsOptional()
  title?: string;

  @ApiPropertyOptional({ description: 'Organization ID' })
  @IsString()
  @IsOptional()
  organizationId?: string;

  @ApiPropertyOptional({ description: 'Custom system prompt for this conversation' })
  @IsString()
  @IsOptional()
  systemPrompt?: string;

  @ApiPropertyOptional({ description: 'Model to use for this conversation', example: 'gpt-4o' })
  @IsString()
  @IsOptional()
  model?: string;
}

export class UpdateConversationDto {
  @ApiPropertyOptional({ description: 'Conversation title' })
  @IsString()
  @MaxLength(300)
  @IsOptional()
  title?: string;

  @ApiPropertyOptional({ description: 'Conversation status', enum: ['active', 'archived'] })
  @IsString()
  @IsOptional()
  status?: 'active' | 'archived';

  @ApiPropertyOptional({ description: 'System prompt override' })
  @IsString()
  @IsOptional()
  systemPrompt?: string;
}
