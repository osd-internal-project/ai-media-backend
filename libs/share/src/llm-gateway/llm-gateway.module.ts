import { Module } from '@nestjs/common';
import { PrismaModule } from '../modules';
import { LlmGatewayService } from './llm-gateway.service';

/**
 * Provides {@link LlmGatewayService}. Import wherever an organization's LLM gateway API key
 * needs to be provisioned or read — `services/users` (eagerly, at organization creation) and
 * `services/core` (lazily, at generation time).
 */
@Module({
  imports: [PrismaModule],
  providers: [LlmGatewayService],
  exports: [LlmGatewayService],
})
export class LlmGatewayModule {}
