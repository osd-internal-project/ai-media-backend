import { IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class ImagePromptRequestDto {
  @ApiPropertyOptional({
    description: 'User ID of the requester',
    example: 'user-uuid-123',
  })
  @IsString()
  @IsOptional()
  userId?: string;

  @ApiPropertyOptional({
    description: 'Existing conversation ID to append results into',
  })
  @IsString()
  @IsOptional()
  conversationId?: string;

  @ApiPropertyOptional({
    description: 'Organization ID for context',
  })
  @IsString()
  @IsOptional()
  organizationId?: string;

  @ApiPropertyOptional({
    description: 'Additional context / instruction for prompt generation',
    example: 'สร้าง prompt สำหรับโฆษณา Facebook แนว minimalist',
  })
  @IsString()
  @IsOptional()
  context?: string;

  @ApiPropertyOptional({
    description: 'Target image generation style',
    example: 'cinematic, hyperrealistic, 4K',
  })
  @IsString()
  @IsOptional()
  style?: string;

  @ApiPropertyOptional({
    description: 'Override model (must support vision e.g. gpt-4o)',
    example: 'gpt-4o',
  })
  @IsString()
  @IsOptional()
  model?: string;
}

export class ImagePromptResponseDto {
  /** The generated English prompt ready to paste into Midjourney / DALL-E / SD */
  prompt: string;

  /** Negative prompt suggestions */
  negativePrompt: string;

  /** Suggested aspect ratio */
  aspectRatio: string;

  /** Brief analysis of the reference image */
  analysis: string;

  /** Full structured breakdown */
  breakdown: {
    subject: string;
    action: string;
    environment: string;
    lighting: string;
    cameraAngle: string;
    style: string;
    colorPalette: string;
  };

  tokenUsage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    model: string;
  };

  conversationId?: string;
  messageId?: string;
}
