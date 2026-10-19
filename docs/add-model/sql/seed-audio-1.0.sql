-- Seed Audio 1.0 → generation type `audio`
-- ใส่ไว้แบบปิด (is_active=false, send_api ว่าง) เพราะ LLM gateway ยังไม่มี route ของ Seed Audio
-- (ต้นทาง BytePlus: POST https://voice.ap-southeast-1.bytepluses.com/api/v3/tts/create)
-- เปิดใช้เมื่อ route พร้อม:
--   UPDATE master_model_type SET send_api = '<gateway route>', is_active = true, updated_at = now()
--   WHERE model_type = 'seed-audio-1.0' AND type = 'audio';
-- send_config.type 'seedaudio1' ต้องตรงกับ registry ใน worker audio.service.ts และ frontend model-registry.ts
--
-- creditFormula: $0.15/min = $0.0025/s × 1157.41 credit/USD (อัตราเดียวกับ Seedance 1.5 Pro: token/720 ↔ $1.2/1M token)
--   core hold ตอน submit (ยังไม่มี body.duration) = เพดาน 120s = 348 credit
--   worker ตัดจริงด้วย body.duration = original_duration จาก provider แล้วคืนส่วนต่าง
INSERT INTO master_model_type
  (name, model_type, type, description, is_default, is_active,
   send_api, task_poll_api, task_poll_sec, send_config, model_details, updated_at)
VALUES
  ('Seed Audio 1.0', 'seed-audio-1.0', 'audio', 'text-to-audio', true, false,
   '', NULL, 10,
   '{"type":"seedaudio1","configType":"application/json","authorization":""}'::jsonb,
   '{
      "status": "Activated",
      "modelId": "seed-audio-1.0",
      "calculationType": "NOT_USE_TOKEN",
      "creditFormula": "ceil(min(body.duration ?? 120, 120) * 0.0025 * 1157.41)",
      "pricing": { "unit": "USD/Minute", "textToAudio": 0.15 },
      "modalities": { "input": ["text", "audio", "image"], "output": ["audio"] },
      "limitations": { "maxOutputSeconds": 120, "maxReferenceSeconds": 30, "maxReferences": 3 },
      "description": "Speech, music and sound effects from a prompt with optional voice/image references"
    }'::jsonb,
   now());
