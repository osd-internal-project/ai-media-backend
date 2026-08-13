import {
  IsArray,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CHAT_GENERATE_TYPES } from '@ai-media/share';

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

  @ApiProperty({
    description:
      'Organization ID. Required — it selects the LLM gateway key the request is billed against.',
  })
  @IsString()
  @MinLength(1)
  organizationId: string;

  @ApiPropertyOptional({
    description:
      'Active generator tab. Selects the assistant role (image / video / omnihumen / dreamactor).',
    enum: CHAT_GENERATE_TYPES,
  })
  @IsIn(CHAT_GENERATE_TYPES as unknown as string[])
  @IsOptional()
  generateType?: string;

  @ApiPropertyOptional({ description: 'Override system prompt for this request' })
  @IsString()
  @IsOptional()
  systemPrompt?: string;

  @ApiPropertyOptional({
    description: 'Model id from GET /chat-models. Falls back to the default model.',
    example: 'llama3.3-70b',
  })
  @IsString()
  @IsOptional()
  model?: string;

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

  @ApiProperty({
    description:
      'Organization ID. Required — it selects the LLM gateway key the request is billed against.',
  })
  @IsString()
  @MinLength(1)
  organizationId: string;

  @ApiPropertyOptional({
    description: 'Active generator tab. Selects the assistant role.',
    enum: CHAT_GENERATE_TYPES,
  })
  @IsIn(CHAT_GENERATE_TYPES as unknown as string[])
  @IsOptional()
  generateType?: string;

  @ApiPropertyOptional({ description: 'Model id from GET /chat-models' })
  @IsString()
  @IsOptional()
  model?: string;
}
