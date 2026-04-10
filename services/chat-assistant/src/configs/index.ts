export default () => ({
  env: process.env.NODE_ENV ?? 'local',
  port: process.env.PORT || 4004,
  openai: {
    apiKey: process.env.OPENAI_API_KEY ?? '',
    baseUrl: process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1',
    model: process.env.OPENAI_MODEL ?? 'gpt-4o',
    fallbackModel: process.env.OPENAI_FALLBACK_MODEL ?? 'gpt-3.5-turbo',
    maxRetries: Number(process.env.OPENAI_MAX_RETRIES ?? 3),
    timeoutMs: Number(process.env.OPENAI_TIMEOUT_MS ?? 60000),
  },
  moderation: {
    enabled: process.env.MODERATION_ENABLED !== 'false',
  },
  memory: {
    maxMessages: Number(process.env.MEMORY_MAX_MESSAGES ?? 20),
    maxTokenBudget: Number(process.env.MEMORY_MAX_TOKEN_BUDGET ?? 8000),
  },
});
