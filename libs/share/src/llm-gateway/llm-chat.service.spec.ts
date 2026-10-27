import axios from 'axios';
import { Readable } from 'stream';
import { LlmChatService } from './llm-chat.service';
import { LlmStreamEvent } from './llm-chat.types';

jest.mock('axios');
const post = axios.post as jest.Mock;

const request = {
  apiKey: 'org-key',
  model: 'llama3.3-70b',
  messages: [{ role: 'user' as const, content: 'hi' }],
};

async function collect(service: LlmChatService) {
  const events: LlmStreamEvent[] = [];
  for await (const event of service.stream(request)) events.push(event);
  return events;
}

describe('LlmChatService.stream', () => {
  beforeEach(() => post.mockReset());

  it('reports the gateway reason when a stream request is rejected', async () => {
    post.mockRejectedValue({
      message: 'Request failed with status code 400',
      response: {
        status: 400,
        data: Readable.from([
          JSON.stringify({ error: { message: 'model not allowed for this key' } }),
        ]),
      },
    });

    await expect(collect(new LlmChatService())).rejects.toMatchObject({
      message: 'LLM gateway chat completion failed: model not allowed for this key',
      status: 400,
      retryable: false,
    });
  });

  it('passes through finish_reason so a truncated answer is visible', async () => {
    const sse = [
      'data: {"choices":[{"delta":{"content":"a cat"}}]}\n',
      'data: {"choices":[{"delta":{},"finish_reason":"length"}]}\n',
      'data: {"choices":[],"usage":{"prompt_tokens":5,"completion_tokens":1000}}\n',
      'data: [DONE]\n',
    ];
    post.mockResolvedValue({ data: Readable.from(sse.map((l) => Buffer.from(l))) });

    const events = await collect(new LlmChatService());

    expect(events).toEqual([
      { type: 'delta', content: 'a cat' },
      { type: 'finish', finishReason: 'length' },
      {
        type: 'usage',
        usage: { promptTokens: 5, completionTokens: 1000, totalTokens: 1005 },
        model: 'llama3.3-70b',
      },
    ]);
  });
});
