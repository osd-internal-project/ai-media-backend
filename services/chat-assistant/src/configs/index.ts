/**
 * ค่า config ของ chat-assistant
 *
 * ไม่มีบล็อก openai อีกต่อไป — แชททั้งหมดวิ่งผ่าน LLM gateway ด้วย key ของ org
 * (ดู LlmChatService + LlmGatewayService.getOrCreateApiKey) ปลายทางและ timeout
 * ของการเรียกโมเดลอ่านจาก env ชุดเดียวกับ services อื่นคือ LLM_GATEWAY_URL /
 * LLM_CHAT_BASE_URL / LLM_CHAT_TIMEOUT_MS ซึ่ง LlmChatService อ่านเองโดยตรง
 */
export default () => ({
  env: process.env.NODE_ENV ?? 'local',
  port: process.env.PORT || 4004,
  memory: {
    maxMessages: Number(process.env.MEMORY_MAX_MESSAGES ?? 20),
    maxTokenBudget: Number(process.env.MEMORY_MAX_TOKEN_BUDGET ?? 8000),
  },
  cors: {
    /**
     * origin ที่เรียก service นี้ได้ — คั่นด้วย comma
     *
     * เดิมตั้งไว้เป็น '*' ซึ่งแปลว่าเว็บไหนก็ยิงมาได้จากเบราว์เซอร์ของผู้ใช้
     * ปล่อยว่าง = อนุญาตทุก origin (ไว้ใช้ตอน dev เท่านั้น)
     */
    allowedOrigins: (process.env.CORS_ALLOWED_ORIGINS ?? '')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
  },
});
