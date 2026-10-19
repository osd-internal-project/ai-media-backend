-- Seed Audio 1.0 → generation type `audio` (ยังไม่ได้รัน — รันเองหลังตรวจ)
-- ก่อนรัน แก้ 2 ค่า:
--   1. send_api      → route ของ Seed Audio บน LLM gateway (ต้นทาง BytePlus: POST /api/v3/tts/create)
--   2. creditFormula → ราคาต่อครั้ง (NOT_USE_TOKEN = ไม่ใช้ token; body คือ RequestAudioGenerateDto)
-- send_config.type 'seedaudio1' ต้องตรงกับ registry ใน worker audio.service.ts และ frontend model-registry.ts
INSERT INTO master_model_type
  (name, model_type, type, description, is_default, is_active,
   send_api, task_poll_api, task_poll_sec, send_config, model_details, updated_at)
VALUES
  ('Seed Audio 1.0', 'seed-audio-1.0', 'audio', 'text-to-audio', true, true,
   'https://llmgateway.osd.co.th/REPLACE_WITH_SEED_AUDIO_ROUTE', NULL, 10,
   '{"type":"seedaudio1","configType":"application/json","authorization":""}'::jsonb,
   '{
      "status": "Activated",
      "modelId": "seed-audio-1.0",
      "calculationType": "NOT_USE_TOKEN",
      "creditFormula": "10",
      "pricing": { "unit": "USD/Minute", "textToAudio": 0.15 },
      "modalities": { "input": ["text", "audio", "image"], "output": ["audio"] },
      "limitations": { "maxOutputSeconds": 120, "maxReferenceSeconds": 30, "maxReferences": 3 },
      "description": "Speech, music and sound effects from a prompt with optional voice/image references"
    }'::jsonb,
   now());
