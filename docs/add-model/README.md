# เพิ่ม AI model ใหม่ — Backend

ชุดเอกสารสำหรับเพิ่ม AI generation model เข้า ai-cave ฝั่ง backend
ฝั่ง frontend มีชุดคู่กันที่ `ai-media-frontend/docs/add-model/` — **โมเดลใหม่ส่วนใหญ่ต้องทำทั้งสองฝั่ง**

---

## เลือกไฟล์ที่ต้องอ่าน

| ไฟล์ | อ่านเมื่อ |
|---|---|
| [MANUAL.md](./MANUAL.md) | คุณจะทำเอง อยากรู้ขั้นตอนและเหตุผล |
| [AI-RECIPE.md](./AI-RECIPE.md) | จะให้ Claude Code ทำให้ — ไฟล์นี้เขียนถึง AI โดยตรง |
| [REFERENCE.md](./REFERENCE.md) | อยากรู้ว่า field ไหนคืออะไร ใครอ่าน มีกับดักตรงไหน |
| [NEW-TAB.md](./NEW-TAB.md) | generation type ใหม่ทั้งหมด (เช่น audio) — งานใหญ่ ต้องมีคนรีวิว |
| [example-seedance2.input.md](./example-seedance2.input.md) | **ตัวอย่าง INPUT ที่กรอกครบแล้ว** ย้อนรอยจาก seedance2 ของจริง — copy ไปแก้ได้เลย |

---

## ระบบทำงานยังไง (60 วินาที)

ทุกอย่างผูกกันด้วยสตริงเดียวคือ **`master_model_type.sendConfig.type`**

```
row ใน master_model_type  (sendConfig.type = "seedance3")
    │
    ├─ FRONTEND
    │   header-generate-image.tsx <Select>  →  page.tsx resolveModel()
    │   ├─ *-form-renderer.tsx  → formComponentByType["seedance3"] → ฟอร์มที่เขียนมือ
    │   └─ model-registry.ts    → videoConfigByType["seedance3"]   → buildSubmitPayload()
    │        └─ socket.emit("generate:video", payload)
    │
    └─ BACKEND
        core  websocket.gateway.ts → GenerateVideoService (extends BaseGenerateService)
              · findOne({ modelType, type, isActive: true })  ← ไม่เจอ = "Model not found"
              · llmGateway.getOrCreateApiKey(orgId) + checkCreditQuota
              · queue.add(job ที่พก sendApi / sendConfig / taskPollApi)
        worker  video.service.ts
              · payloadBuilders["seedance3"](body, sendConfig)
              · axios.post(sendApi) → poll taskPollApi → download → TOS
```

3 ที่ที่ค่า `sendConfig.type` ต้องตรงกันเป๊ะ:
DB row → `payloadBuilders` (worker) → `model-registry.ts` + `*-form-renderer.tsx` (frontend)

---

## 3 Case

| Case | สถานการณ์ | งาน |
|---|---|---|
| **A** | payload เหมือนโมเดลเดิมเป๊ะ | insert row ใช้ `sendConfig.type` เดิม — **ไม่แตะโค้ด** |
| **B** | payload ต่าง | insert row + builder ใหม่ที่ worker + งานฝั่ง frontend |
| **C** | generation type ใหม่ทั้งหมด | [NEW-TAB.md](./NEW-TAB.md) |

---

## วิธีเรียกใช้ให้ AI ทำให้

**แบบ slash command** (แนะนำ):

```
/add-model
```

แล้วพิมพ์ข้อมูลตาม INPUT SPEC ข้างล่างต่อท้าย หรือใส่ path ของไฟล์ที่กรอกไว้แล้ว:

```
/add-model docs/add-model/new-model.input.md
```

**แบบพิมพ์เอง:**

```
อ่าน docs/add-model/AI-RECIPE.md แล้วเพิ่ม model นี้ให้หน่อย
<แปะ INPUT SPEC ที่กรอกแล้ว>
```

AI จะถามกลับถ้าข้อมูลบังคับขาด — **อย่าบอกให้มันเดา** โดยเฉพาะ `request_payload_example`
เพราะ payload ผิด = job ตายที่ worker หลังหักเครดิตไปแล้ว

---

## INPUT SPEC — ข้อมูลที่ต้องกรอก

คัดลอกบล็อกนี้ไปกรอกแล้วส่งให้ AI (ใช้ชุดเดียวกันทั้ง backend และ frontend)

```yaml
model_name:              # ชื่อที่โชว์ใน dropdown เช่น "Seedance 3.0 Pro"
provider_model_id:       # model id ของ provider เช่น "seedance-3-0-pro-260601"
generation_type:         # image | video | omnihumen | dreamactor
modes:                   # เช่น [text-to-video, image-to-video] → 1 row ต่อ 1 mode
send_config_type:        # slug ใหม่ เช่น "seedance3" (Case A ใช้ค่าเดิมของโมเดลที่ payload เหมือนกัน)
send_api:                # URL สร้าง task
task_poll_api:           # URL base ของ GET {base}/{taskId}
task_poll_sec: 10        # optional
auth_mode: llm-gateway   # optional — default per-org key, ไม่ต้องใส่ token

request_payload_example: |
  # JSON body จริงที่ provider รับ — บังคับ ห้ามเดา
  {
    "model": "seedance-3-0-pro-260601",
    "content": [ ... ],
    "ratio": "16:9",
    "duration": 5
  }

response_example: |
  # ตอบตอน submit
  { "id": "cgt-2026..." }
  # ตอบตอน poll
  { "status": "succeeded", "content": { "video_url": "https://..." } }

inputs:                  # input ที่โมเดลรับ + role + จำนวนสูงสุด
  - prompt (required)
  - image ×2 → first_frame / last_frame
  - audio ×1 → reference_audio

controls:                # ตัวเลือกที่ user ปรับได้ใน UI
  ratio: ["16:9", "9:16", "1:1"]
  resolution: ["480p", "720p", "1080p"]
  duration: { min: 3, max: 15 }
  audio: true
  draft: true

pricing:
  calculationType: FORMULA      # FORMULA | USE_TOKEN | NOT_USE_TOKEN
  creditFormula: "body.duration * 42"

similar_to: seedance2    # optional แต่ช่วยมาก — บอกว่าให้ copy ตัวไหนเป็นฐาน
is_default: false        # optional
```

| Field | บังคับ | default ถ้าไม่ใส่ |
|---|---|---|
| `model_name`, `provider_model_id`, `generation_type`, `modes` | ✅ | — |
| `send_config_type`, `send_api`, `task_poll_api` | ✅ | — |
| `request_payload_example`, `response_example` | ✅ | — |
| `inputs`, `controls`, `pricing` | ✅ | — |
| `task_poll_sec` | – | `10` |
| `auth_mode` | – | `llm-gateway` (`sendConfig.authorization` เว้นว่าง) |
| `similar_to` | – | AI จะเสนอตัวที่ใกล้ที่สุดให้ยืนยัน |
| `is_default` | – | `false` |

---

## กับดัก 3 อันดับแรก

1. **`isActive` default เป็น `false`** — ลืมเซ็ต `true` แล้วโมเดลจะโผล่ใน dropdown
   (เพราะ `GET /ai-models` ไม่กรอง `isActive`) แต่กด generate เจอ `"Model not found"`
2. **ลืมลงทะเบียนใน `payloadBuilders`** — `UnrecoverableError: Unsupported ... sendConfig.type`
3. **ลืม presign object key** — provider โหลดไฟล์ไม่ได้ ต้องผ่าน `storageUrl.toProviderUrl(...)` เสมอ

รายการเต็มอยู่ใน [REFERENCE.md §9](./REFERENCE.md#9-gotchas-)
