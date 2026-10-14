# MANUAL — เพิ่ม AI model ใหม่ด้วยมือ (Backend)

เอกสารนี้เขียนให้ **คน** อ่าน มีคำอธิบายว่าทำไมต้องทำแต่ละขั้น
ถ้าจะให้ AI ทำให้อัตโนมัติ ใช้ [AI-RECIPE.md](./AI-RECIPE.md) แทน
ตารางอ้างอิง field / gotchas อยู่ใน [REFERENCE.md](./REFERENCE.md)

---

## Step 0 — เลือก Case ก่อน

| Case | เมื่อไหร่ | ต้องทำอะไร |
|---|---|---|
| **A** | provider ปล่อยรุ่นใหม่ที่ **payload หน้าตาเหมือนเดิมเป๊ะ** (เช่น seedream รุ่นใหม่ที่รับ field เดิม) | insert row ใหม่ ใช้ `sendConfig.type` เดิม — **ไม่แตะโค้ดเลย** |
| **B** | payload ต่างจากของเดิม (field ใหม่ / role ใหม่ / โครง content ต่าง) | insert row + เขียน builder ใหม่ที่ worker + งานฝั่ง frontend |
| **C** | generation type ใหม่ทั้งหมด (เช่น audio ที่ยังไม่มี tab) | ดู [NEW-TAB.md](./NEW-TAB.md) — งานใหญ่ |

**วิธีตัดสิน:** เอา `request_payload_example` ของโมเดลใหม่ ไปเทียบกับ output ของ builder ที่มีอยู่
(`buildSeedance1Payload`, `buildSeedance2Payload`, `buildSeedream1Payload`, ...)
ถ้าเหมือนกันทุก field → Case A ถ้าต่างแม้แต่ field เดียว → Case B

ที่เหลือของเอกสารนี้คือ **Case B** (Case A คือทำแค่ Step 1)

---

## Step 1 — สร้าง row ใน `master_model_type`

**1 row ต่อ 1 mode** ตามคอนเวนชันเดิม เช่นโมเดล video ที่ทำได้ทั้ง text-to-video และ image-to-video
= 2 rows ที่ต่างกันแค่ `description`

```bash
curl -X POST "$CORE_URL/master-model-type" \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "Seedance 3.0 Pro",
    "modelType": "seedance-3-0-pro-260601",
    "type": "video",
    "description": "text-to-video",
    "isDefault": false,
    "isActive": true,
    "sendApi": "https://ark.ap-southeast.bytepluses.com/api/v3/contents/generations/tasks",
    "taskPollApi": "https://ark.ap-southeast.bytepluses.com/api/v3/contents/generations/tasks",
    "taskPollSec": 10,
    "sendConfig": {
      "type": "seedance3",
      "configType": "application/json",
      "authorization": "",
      "watermark": false,
      "stream": false
    },
    "modelDetails": {
      "status": "Activated",
      "modelId": "seedance-3-0-pro-260601",
      "calculationType": "FORMULA",
      "creditFormula": "body.duration * 42",
      "pricing": { "unit": "USD/Second", "textToVideo": 0.12 },
      "modalities": { "input": ["text", "image"], "output": ["video"] },
      "limitations": { "resolution": ["480p", "720p", "1080p"], "duration": [3, 15] },
      "description": "…ข้อความที่จะโชว์ใน dropdown…"
    }
  }'
```

จุดที่พลาดบ่อย:

- **`isActive: true`** — default คือ `false` ลืมแล้วโมเดลจะโผล่ใน dropdown (เพราะ `GET /ai-models`
  ไม่กรอง `isActive`) แต่กด generate แล้วเจอ `"Model not found"`
- **`type` ต้องเป็น `video` ไม่ใช่ `vdo`** — `BaseGenerateService` ค้นด้วยคู่ `(modelType, type)`
- **`sendConfig.authorization` ปล่อยว่าง** — `GET /ai-models` คืน `sendConfig` ทั้งก้อนออกไปหา frontend
  ระบบใช้ per-org key จาก LLM Gateway อยู่แล้ว
- ไม่ต้องใส่ `optionCode` / `requestBodyMap` / `taskResponseMap` — ไม่มีโค้ดอ่าน

> **ไม่ต้องทำ migration** เพราะไม่ได้เปลี่ยนรูปร่างตาราง ทำ migration เฉพาะตอนเพิ่มคอลัมน์จริง ๆ
> (`yarn migrate:dev` แล้ว `yarn generate`)

ถ้าจะให้ dev คนอื่นได้ข้อมูลนี้ด้วย เพิ่มลง
[`libs/prisma/seed/data/master_model_type.json`](../../libs/prisma/seed/data/master_model_type.json)
— ระวังไฟล์นี้ stale (ใช้ `"vdo"` และไม่มี `sendApi`/`sendConfig`/`isActive`) row ใหม่ต้องใส่ให้ครบเอง

---

## Step 2 — เพิ่ม field ใน DTO (เฉพาะเมื่อต้องรับ input ใหม่จาก frontend)

ถ้าโมเดลใหม่ต้องการ input ที่ `RequestVideoGenerateDto` ยังไม่มี ให้เพิ่มที่
[`libs/share/src/types/video-generate.ts`](../../libs/share/src/types/video-generate.ts)
(หรือ `image-generate.ts` / `omnihumen-generate.ts` / `dreamactor-generate.ts` ตาม type)

ตัวอย่างจริงคือตอนทำ seedance2 ที่เพิ่ม:

```ts
files: { type: 'image' | 'video' | 'audio'; url: string }[];
```

ทำให้ทุก reference (image/video/audio) ส่งมาใน array เดียวแทนที่จะจำกัดแค่ 2 frame slot

**ทำให้เป็น optional หรือมี default เสมอ** เพราะ DTO นี้ใช้ร่วมกับโมเดลเดิมทุกตัว
field ใหม่ที่บังคับจะทำให้โมเดลเก่าพัง

ถ้าเพิ่ม field ใน DTO แล้ว ต้องไปเพิ่มใน `XGeneratePayload` ฝั่ง frontend ด้วย
(ดู `ai-media-frontend/docs/add-model/MANUAL.md`)

---

## Step 3 — เขียน payload builder ที่ worker

แก้ไฟล์ตาม type: [`services/worker-service/src/generate/video.service.ts`](../../services/worker-service/src/generate/video.service.ts)
(หรือ `image.service.ts` / `omnihumen.service.ts` / `dreamactor.service.ts`)

### 3.1 เขียน private method

วางไว้ติดกับ builder ตัวอื่นในไฟล์เดียวกัน

```ts
private async buildSeedance3Payload(
  body: RequestVideoGenerateDto,
  _modelDetail: any,
) {
  // ทุก object key ต้อง presign ก่อน ไม่งั้น provider โหลดไฟล์ไม่ได้
  const refs = await Promise.all(
    body.files.map(async (file) => ({
      type: `${file.type}_url`,
      [`${file.type}_url`]: { url: await this.presignRef(file.url) },
      role: `reference_${file.type}`,
    })),
  );

  return {
    model: body.model,
    content: [{ type: 'text', text: body.prompt }, ...refs],
    ratio: body.ratio,
    duration: body.duration,
    resolution: body.resolution,
    generate_audio: body.generateAudio,
    watermark: body.watermark,
    draft: body.draft,
  };
}
```

กฎที่ต้องตามให้ครบ:

- **presign ทุก object key** ด้วย `this.presignRef(...)` (video.service.ts) หรือ
  `this.storageUrl.toProviderUrl(...)` / `.toProviderUrls([...])` ในไฟล์อื่น
  `toProviderUrl` มี guard ในตัว: ค่าที่เป็น URL อยู่แล้ว (reference จาก workflow) จะไม่ presign ซ้ำ
- `model: body.model` เสมอ — ค่านี้คือ `modelType` จาก DB
- อ่านค่าจาก `sendConfig` ได้ผ่านพารามิเตอร์ตัวที่สอง (ชื่อ `modelDetail` แต่ค่าจริงคือ `sendConfig`)
  แบบที่ `buildSeedream1Payload` ทำกับ `watermark` / `stream`
- input ที่โมเดลไม่รองรับให้ **ข้ามอย่างเงียบ ๆ** พร้อม comment อธิบาย (แบบ `buildSeedance1Payload`
  ที่ตัด reference เกิน 2 frame ทิ้ง) อย่า throw เพราะ UI อาจส่งมาโดยไม่ได้ตั้งใจ

### 3.2 ลงทะเบียนใน `payloadBuilders`

```ts
private readonly payloadBuilders: Record<
  string,
  (body: RequestVideoGenerateDto, modelDetail: any) => any
> = {
  seedance1: this.buildSeedance1Payload.bind(this),
  seedance2: this.buildSeedance2Payload.bind(this),
  seedance3: this.buildSeedance3Payload.bind(this),   // ← เพิ่มบรรทัดนี้
};
```

**คีย์ต้องตรงกับ `sendConfig.type` ใน DB เป๊ะ ๆ** ลืมลงทะเบียนแล้ว job จะตายด้วย
`UnrecoverableError: Unsupported video sendConfig.type: "seedance3"` (ไม่ retry เพราะแก้ไม่ได้ด้วยการ retry)

---

## Step 4 — ตรวจ poll loop และ response path

ค่า default รองรับรูปแบบ BytePlus Ark อยู่แล้ว:

- submit ตอบ `{ id: "cgt-..." }` → เก็บเป็น `videoTaskId`
- poll `GET ${taskPollApi}/${videoTaskId}` จนกว่า `status === 'succeeded'`
- อ่านผลจาก `content.video_url`
- timeout 20 นาที แล้ว throw `UnrecoverableError('generation timed out')`

ถ้า provider ใหม่ตอบต่างจากนี้ ต้องแก้เพิ่ม:

| provider ตอบต่างตรงไหน | แก้ที่ |
|---|---|
| task id อยู่คนละ path (ไม่ใช่ `apiRes.data.id`) | จุด `videoTaskId = apiRes.data.id` ใน `process()` |
| poll URL ไม่ใช่ `{base}/{id}` | จุดประกอบ `const url = \`${statusBaseUrl}/${videoTaskId}\`` |
| ค่า status ไม่ใช่ `succeeded` / มี state อื่น | เงื่อนไข while loop |
| result URL อยู่คนละ path | `interface BytepluseResponse` + จุดที่อ่าน `content.video_url` |

worker เก็บ `videoTaskId` กลับเข้า job ด้วย `job.updateData()` เพื่อไม่ให้ BullMQ retry ยิง
submit ซ้ำ (ซึ่งจะเสียเงิน generate ใหม่) — ถ้าแก้ flow ตรงนี้อย่าทำหลุด

---

## Step 5 — pricing

ใส่ใน `modelDetails` ตอน Step 1:

```json
{ "calculationType": "FORMULA", "creditFormula": "body.duration * 42" }
```

สูตรถูก eval ด้วย `new Function` ที่รับเฉพาะ `token`, `body` และ helper
`pow abs min max round ceil floor ternary` — ใช้ตัวแปรอื่นไม่ได้

ถ้าไม่ใส่ `calculationType` จะตกไป hardcoded fallback ใน
[`generate-helper.service.ts`](../../services/core/src/generate/services/generate-helper.service.ts)
ซึ่งคิดตาม type แบบกว้าง ๆ (video = pixel tier × duration) — **แนะนำให้ใส่สูตรเสมอ**
ไม่งั้นราคาจะเพี้ยนเงียบ ๆ

ตรวจได้ผ่าน `POST /generate/get-credit-pre-send` ซึ่งเป็น endpoint เดียวกับที่ UI โชว์เครดิตก่อนกด

---

## Step 6 — Verify

```bash
cd ai-media-backend

# 1. คอมไพล์ผ่าน
yarn build            # หรือ npx tsc --noEmit -p services/worker-service

# 2. builder ถูกลงทะเบียนจริง (ต้องเจอ 2 บรรทัด: นิยาม + registry)
grep -n "seedance3" services/worker-service/src/generate/video.service.ts

# 3. row เข้า DB และ active
curl -s "$CORE_URL/master-model-type" \
  | jq '.[] | select(.modelType=="seedance-3-0-pro-260601")
        | {id, type, isActive, sendApi, sendConfig, taskPollApi}'
```

ต้องเห็น `isActive: true`, `type: "video"`, และ `sendConfig.type` ตรงกับคีย์ใน `payloadBuilders`

**End-to-end** (ด่านเดียวที่จับ payload ผิดได้จริง — ข้ามไม่ได้)

1. รัน core + worker + frontend
2. เปิด project → tab ที่เกี่ยว → เลือกโมเดลใหม่ใน dropdown
3. กด generate แล้วดู log worker:
   - ต้องไม่มี `Unsupported ... sendConfig.type`
   - ถ้า provider ปฏิเสธ log จะพิมพ์ `❌ Video API call failed: API {status}: {message} | payload=... | response=...`
     เอา `payload=` ไปเทียบกับ `request_payload_example` ทีละ field
4. รอจน poll สำเร็จ → ไฟล์ขึ้นใน gallery
5. เช็คว่าเครดิตถูกหักตรงกับสูตร

---

## Checklist

- [ ] Step 0 — ตัดสิน Case A/B/C แล้ว
- [ ] Step 1 — row ครบทุก mode, `isActive: true`, `type` สะกดถูก, `sendConfig.authorization` ว่าง
- [ ] Step 2 — field ใหม่ใน DTO เป็น optional (ถ้ามี)
- [ ] Step 3 — builder เขียนแล้ว **และลงทะเบียนใน `payloadBuilders` แล้ว**
- [ ] Step 3 — presign ทุก object key
- [ ] Step 4 — poll / response path ตรวจแล้ว
- [ ] Step 5 — `calculationType` + สูตรใส่แล้ว
- [ ] Step 6 — build ผ่าน + generate จริงสำเร็จ + เครดิตถูก
- [ ] ฝั่ง frontend ทำครบตาม `ai-media-frontend/docs/add-model/MANUAL.md` ด้วย `sendConfig.type` ค่าเดียวกัน
