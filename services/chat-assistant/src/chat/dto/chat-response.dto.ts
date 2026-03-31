export class TokenUsageDto {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  model: string;
}

export class ToolCallDto {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export class ChatResponseDto {
  conversationId: string;
  messageId: string;
  content: string;
  role: 'assistant';
  tokenUsage: TokenUsageDto;
  toolCalls?: ToolCallDto[];
  finishReason?: string;
  createdAt: Date;
}

export class StreamChunkDto {
  type: 'content' | 'tool_call' | 'done' | 'error';
  delta?: string;
  toolCall?: ToolCallDto;
  tokenUsage?: TokenUsageDto;
  conversationId?: string;
  messageId?: string;
  finishReason?: string;
  error?: string;
}
