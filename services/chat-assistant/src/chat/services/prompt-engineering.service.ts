import { Injectable, Logger } from '@nestjs/common';

export interface LlmMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  name?: string;
  tool_call_id?: string;
  tool_calls?: any[];
}

@Injectable()
export class PromptEngineeringService {
  private readonly logger = new Logger(PromptEngineeringService.name);

  /**
   * Build the system prompt based on context.
   * You can extend this to inject brand kit info, user persona, org context, etc.
   */
  buildSystemPrompt(options: {
    customSystemPrompt?: string;
    organizationId?: string;
    userId?: string;
  }): string {
    if (options.customSystemPrompt) {
      return options.customSystemPrompt;
    }

    const now = new Date().toISOString();
    return [
      `You are a specialized Creative Prompt Engineer for a Digital Team. Your goal is to transform ideas into high-quality, descriptive prompts for AI image generators (like Midjourney, DALL-E 3, or Stable Diffusion).`,
      ``,
      `### Strict Constraints (Do NOT violate):`,
      `- You must strictly answer ONLY topics related to Digital Marketing, Graphic Design, Branding, and AI Image Prompt Generation.`,
      `- Refuse to answer any questions about general knowledge, programming, math, history, coding, entertainment, cooking, or anything else unrelated to marketing/design.`,
      `- If the user asks about an unrelated topic, politely but firmly state that your only purpose is to help with marketing and design prompts.`,
      ``,
      `### Your Core Responsibilities:`,
      `1. Structure & Detail: Always include key artistic elements: Subject, Action, Environment, Lighting, Camera Angle, and Style.`,
      `2. Digital Marketing Focus: Prioritize clarity, aesthetic appeal, and "social media-ready" quality.`,
      `3. Optimization: Suggest aspect ratios and negative prompts if relevant.`,
      `4. Language: Respond in the same language the user uses, but always provide the final image prompt in English.`,
      ``,
      `Current UTC time: ${now}`,
      `Respond clearly, concisely, and in the same language the user uses.`,
      `If you are unsure about something, say so honestly.`
    ].join('\n');
  }

  /**
   * Prepend the system message to the conversation history.
   */
  buildMessages(
    systemPrompt: string,
    history: LlmMessage[],
    userMessage: string,
  ): LlmMessage[] {
    const messages: LlmMessage[] = [
      { role: 'system', content: systemPrompt },
      ...history,
      { role: 'user', content: userMessage },
    ];
    this.logger.debug(`Built ${messages.length} messages for LLM call`);
    return messages;
  }

  /**
   * Estimate token count (rough approximation: 1 token ≈ 4 chars).
   * Replace with tiktoken for production accuracy.
   */
  estimateTokens(text: string): number {
    return Math.ceil((text ?? '').length / 4);
  }

  estimateMessagesTokens(messages: LlmMessage[]): number {
    return messages.reduce((sum, m) => {
      const content = typeof m.content === 'string' ? m.content : '';
      return sum + this.estimateTokens(content);
    }, 0);
  }
}
