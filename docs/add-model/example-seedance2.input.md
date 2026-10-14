# ตัวอย่าง INPUT — seedance2 (ย้อนรอยจากโค้ดจริง)

ไฟล์นี้คือ INPUT SPEC ที่กรอกครบแล้ว ใช้เป็นตัวอย่างว่าต้องบอก AI อะไรบ้าง
ข้อมูลทั้งหมดย้อนรอยมาจากโมเดล `seedance2` ที่อยู่ในระบบจริง — ถ้าเอาไฟล์นี้ไปสั่ง `/add-model`
AI จะสร้างของที่มีอยู่แล้วซ้ำ ให้ **copy โครงไปแก้เป็นโมเดลใหม่** แทน

วิธีใช้:

```
/add-model docs/add-model/example-seedance2.input.md
```

หรือ copy บล็อก YAML ข้างล่างไปแก้แล้วแปะต่อท้าย `/add-model` ได้เลย
INPUT ชุดนี้ใช้ได้ทั้ง repo backend และ frontend — กรอกครั้งเดียว สั่งสองรอบ

---

## INPUT

```yaml
model_name: "Seedance 1.5 Pro"
provider_model_id: "seedance-1-5-pro-251215"
generation_type: video
modes:
  - text-to-video
  - image-to-video
send_config_type: seedance2

send_api: "https://ark.ap-southeast.bytepluses.com/api/v3/contents/generations/tasks"
task_poll_api: "https://ark.ap-southeast.bytepluses.com/api/v3/contents/generations/tasks"
task_poll_sec: 10
auth_mode: llm-gateway

request_payload_example: |
  {
    "model": "seedance-1-5-pro-251215",
    "content": [
      { "type": "text", "text": "a cat walking on the beach at sunset" },

      { "type": "image_url", "image_url": { "url": "https://…signed…" }, "role": "reference_image" },
      { "type": "video_url", "video_url": { "url": "https://…signed…" }, "role": "reference_video" },
      { "type": "audio_url", "audio_url": { "url": "https://…signed…" }, "role": "reference_audio" },

      { "type": "image_url", "image_url": { "url": "https://…signed…" }, "role": "first_frame" },
      { "type": "image_url", "image_url": { "url": "https://…signed…" }, "role": "last_frame" }
    ],
    "draft": false,
    "generate_audio": true,
    "ratio": "16:9",
    "duration": 5,
    "watermark": false,
    "resolution": "1080p"
  }
  # หมายเหตุ:
  # - element ใน content ที่เป็น reference ใส่เท่าที่ผู้ใช้อัปโหลด ไม่มีก็ตัดออกได้
  # - first_frame / last_frame ใส่เมื่อมีค่าเท่านั้น
  # - ทุก url ต้อง presign แล้ว (object key ดิบใช้ไม่ได้)

response_example: |
  # ตอบตอน submit (POST send_api)
  { "id": "cgt-20260202111751-ncbdf" }

  # ตอบตอน poll (GET {task_poll_api}/{id})
  {
    "id": "cgt-20260202111751-ncbdf",
    "model": "seedance-1-5-pro-251215",
    "status": "succeeded",
    "content": { "video_url": "https://…signed….mp4" },
    "usage": { "completion_tokens": 108900, "total_tokens": 108900 },
    "created_at": 1743414619,
    "updated_at": 1743414673,
    "seed": 10
  }
  # จบเมื่อ status === "succeeded" — result อยู่ที่ content.video_url

inputs:
  - prompt (required)
  - image / video / audio รวมกันได้สูงสุด 8 ไฟล์ → role reference_image / reference_video / reference_audio
  - image ×2 (ช่องแยก) → role first_frame / last_frame

controls:
  ratio: ["1:1", "4:3", "3:4", "16:9", "9:16", "21:9", "9:21"]
  resolution: ["480p", "720p", "1080p"]
  duration: { min: 4, max: 15, step: 1 }
  audio: true          # toggle generate_audio
  draft: true          # toggle draft mode
  # width/height คำนวณจาก resolution + ratio ในฝั่ง frontend
  # เช่น 1080p + 16:9 → 1920x1080, 720p + 9:16 → 720x1280

pricing:
  calculationType: FORMULA
  creditFormula: "body.duration * 42"

similar_to: seedance1
is_default: false
```

---

## ผลลัพธ์ที่ได้จาก INPUT ชุดนี้

| ฝั่ง | ไฟล์ / ของที่เกิดขึ้น |
|---|---|
| DB | 2 rows ใน `master_model_type` (`text-to-video`, `image-to-video`) |
| Backend | `buildSeedance2Payload()` + entry `seedance2:` ใน `payloadBuilders` ของ `video.service.ts` |
| Backend | field `files: { type; url }[]` ใน `RequestVideoGenerateDto` |
| Frontend | `tabs/video-gen/version/seedance2/config.ts` → `seeda2Config` |
| Frontend | `tabs/video-gen/version/seedance2/chat-video-input.tsx` (+ `prompt-section.tsx` ที่มี `@mentions`) |
| Frontend | entry ใน `model-registry.ts` (`videoConfigByType`) **และ** `video-form-renderer.tsx` (`formComponentByType`) |

`features` ที่แปลงมาจาก `controls`:

```ts
features: {
  maxDuration: 15,
  uploadMode: "multi-file",   // เพราะ inputs รวม reference หลายชนิดใน array เดียว
  showDraftMode: true,
  supportAudio: true,
}
```

---

## ข้อสังเกตจากตัวอย่างนี้

1. **`send_config_type` ไม่ต้องตรงกับเลขรุ่นของ provider**
   `seedance2` คือรุ่นที่ 2 ของ *adapter ในระบบเรา* ส่วน provider เรียกโมเดลนี้ว่า `seedance-1-5-pro`
   slug เป็นแค่คีย์ registry ตั้งให้อ่านง่ายพอ อย่าพยายามให้ตรงกับ version ของ provider

2. **`uploadMode` เป็นสิ่งที่ทำให้ seedance1 กับ seedance2 ต่างกันจริง ๆ**
   - `seedance1` = `"first-last"` รับได้แค่ 2 เฟรม → payload ใช้ `body.image[0]`, `body.image[1]`
   - `seedance2` = `"multi-file"` รับ reference หลายชนิด → payload ใช้ `body.files`

   ตอนกรอก `inputs` ให้บอกให้ชัดว่าเป็นแบบไหน เพราะมันกำหนดทั้ง UI และ payload

3. **`duration` ใน `controls` เป็น 4–15 แต่ `features.maxDuration` เป็น 15**
   ค่า min อยู่ใน slider ของฟอร์ม ส่วน `maxDuration` เป็น flag ที่ Workflow อ่าน
   ถ้าโมเดลใหม่มี min ไม่ใช่ 4 ต้องระบุใน `controls` ให้ชัด

4. **`request_payload_example` ต้องแสดง role ให้ครบ** ตัวอย่างนี้โชว์ทั้ง 5 role
   ถึงจะไม่ได้ส่งพร้อมกันทุกครั้ง — AI ต้องเห็นชื่อ role เพื่อเขียน mapping ได้ถูก

5. **ระบุด้วยว่า field ไหน optional** ตัวอย่างนี้ใช้ comment ใน YAML บอก
   ถ้าไม่บอก AI จะใส่ทุก element ลง `content` เสมอ แล้ว provider จะปฏิเสธเพราะ url ว่าง
