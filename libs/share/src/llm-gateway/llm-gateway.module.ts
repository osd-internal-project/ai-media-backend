import { Module } from '@nestjs/common';
import { PrismaModule } from '../modules';
import { LlmGatewayService } from './llm-gateway.service';
import { LlmChatService } from './llm-chat.service';

/**
 * Provides {@link LlmGatewayService} and {@link LlmChatService}.
 *
 * Import wherever an organization's LLM gateway API key needs to be provisioned or read —
 * `services/users` (eagerly, at organization creation) and `services/core` (lazily, at
 * generation time) — or wherever a chat completion is issued (`services/chat-assistant`).
 *
 * The two belong together: `LlmChatService` is useless without a key from
 * `LlmGatewayService`, and both must target the same gateway host for that key to be
 * accepted.
 */
@Module({
  imports: [PrismaModule],
  providers: [LlmGatewayService, LlmChatService],
  exports: [LlmGatewayService, LlmChatService],
})
export class LlmGatewayModule {}
