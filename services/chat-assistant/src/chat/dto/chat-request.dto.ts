import {
  IsArray,
  IsBoolean,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ToolDefinitionDto {
  @ApiProperty({ description: 'Tool name', example: 'get_weather' })
  @IsString()
  name: string;

  @ApiPropertyOptional({ description: 'Tool description' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ description: 'JSON Schema for tool parameters' })
  @IsObject()
  parameters: Record<string, any>;
}

export class ChatRequestDto {
  @ApiProperty({ description: 'User ID', example: 'user-uuid-123' })
  @IsString()
  @MinLength(1)
  userId: string;

  @ApiProperty({
    description: 'The message content to send',
    example: 'Hello, how can you help me?',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(32000)
  message: string;

  @ApiPropertyOptional({ description: 'Conversation ID to continue. Omit to start a new conversation.' })
  @IsString()
  @IsOptional()
  conversationId?: string;

  @ApiPropertyOptional({ description: 'Organization ID for context' })
  @IsString()
  @IsOptional()
  organizationId?: string;

  @ApiPropertyOptional({ description: 'Override system prompt for this request' })
  @IsString()
  @IsOptional()
  systemPrompt?: string;

  @ApiPropertyOptional({ description: 'Override model for this request', example: 'gpt-4o' })
  @IsString()
  @IsOptional()
  model?: string;

  @ApiPropertyOptional({ description: 'Whether to return a streaming response', default: false })
  @IsBoolean()
  @IsOptional()
  stream?: boolean;

  @ApiPropertyOptional({
    description: 'Array of tool definitions to make available in this call',
    type: [ToolDefinitionDto],
  })
  @IsArray()
  @IsOptional()
  tools?: ToolDefinitionDto[];

  @ApiPropertyOptional({ description: 'Extra metadata attached to the message' })
  @IsObject()
  @IsOptional()
  metadata?: Record<string, any>;
}

export class StreamChatQueryDto {
  @ApiProperty({ description: 'User ID' })
  @IsString()
  userId: string;

  @ApiProperty({ description: 'Message to send' })
  @IsString()
  message: string;

  @ApiPropertyOptional({ description: 'Conversation ID' })
  @IsString()
  @IsOptional()
  conversationId?: string;

  @ApiPropertyOptional({ description: 'Organization ID' })
  @IsString()
  @IsOptional()
  organizationId?: string;

  @ApiPropertyOptional({ description: 'Override model' })
  @IsString()
  @IsOptional()
  model?: string;
}
