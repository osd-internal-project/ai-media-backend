# REFERENCE — โครงสร้างข้อมูลและกับดัก (Backend)

เอกสารอ้างอิง ไม่ใช่ขั้นตอน ถ้าต้องการขั้นตอนดู [MANUAL.md](./MANUAL.md)

---

## 1. ตาราง `master_model_type`

Prisma model `MasterModelType` — [`libs/prisma/schema.prisma`](../../libs/prisma/schema.prisma) (`model MasterModelType`)

ตารางนี้คือ **source of truth เดียว** ของ AI model ทุกตัวในระบบ 1 row = 1 model + 1 mode

| Column (Prisma) | DB column | ชนิด | ใครอ่าน | ความหมาย |
|---|---|---|---|---|
| `id` | `id` | `Int` autoincrement | seed (`upsert where id`) | PK |
| `name` | `name` | `VarChar(150)?` | FE `<Select>` | ชื่อที่โชว์ให้ user เห็น เช่น `Seedance 2.0 Pro` |
| `modelType` | `model_type` | `VarChar(150)?` | **BE lookup + payload** | provider model id เช่น `seedance-1-5-pro-251215` ถูกส่งเป็น field `model` ใน payload |
| `type` | `type` | `VarChar(150)?` | **BE lookup + FE tab filter** | `image` \| `video` \| `omnihumen` \| `dreamactor` |
| `description` | `description` | `VarChar(150)?` | FE โชว์ mode | `text-to-image` \| `image-to-image` \| `text-to-video` \| `image-to-video` |
| `isDefault` | `is_default` | `Boolean` = `false` | FE `resolveModel()` | โมเดล default ของ tab นั้น |
| `modelDetails` | `model_details` | `Json?` | FE `<Select>` + BE pricing | pricing / credit formula / modalities / limitations / status |
| `optionCode` | `option_code` | `String[]` = `[]` | — | **dead** ไม่มีโค้ดอ่าน |
| `sendApi` | `send_api` | `Text` = `''` | BE worker `axios.post` | URL ที่ยิงไปสร้าง task |
| `sendConfig` | `send_config` | `Json?` | **BE worker registry + FE registry** | ดูหัวข้อ 2 |
| `requestBodyMap` | `request_body_map` | `Json?` | — | **dead** ส่งเข้า job แต่ไม่มีใครอ่าน |
| `taskPollApi` | `task_poll_api` | `Text?` | BE worker poll | base URL ของ `GET {taskPollApi}/{taskId}` |
| `taskPollSec` | `task_poll_sec` | `Int` = `10` | BE worker | ระยะห่างการ poll (วินาที) |
| `taskResponseMap` | `task_response_map` | `Json?` | — | **dead** |
| `isActive` | `is_active` | `Boolean` = **`false`** | **BE lookup + `GET /master-model-type`** | ⚠️ default `false` ต้องเซ็ต `true` เอง |

> **ไม่ต้องทำ migration เพื่อเพิ่ม model** — migration เปลี่ยน *รูปร่าง* ของตาราง ส่วน model คือ *row*

### ตารางที่ไม่ต้องยุ่ง

| ตาราง | สถานะ |
|---|---|
| `master_model_option` (`MasterModelOption`) | dead — ไม่มี TS reference ทั้ง `services/` และ `libs/` |
| `master_data_config_api` (`MasterDataConfigApi`) | legacy ถูกแทนที่ด้วย `sendApi`/`sendConfig`/`taskPollApi` แล้ว |
| `chat_model_config` (`ChatModelConfig`) | คนละระบบ — LLM chat ของ `services/chat-assistant` |

---

## 2. `sendConfig` — คีย์ที่ผูกทั้งระบบเข้าด้วยกัน

```json
{
  "type": "seedance2",
  "configType": "application/json",
  "authorization": "",
  "watermark": false,
  "stream": false
}
```

| Key | ใช้ที่ไหน |
|---|---|
| `type` | **คีย์ registry** — `payloadBuilders[sendConfig.type]` ที่ worker และ `videoConfigByType[...]` / `formComponentByType[...]` ที่ frontend |
| `configType` | ค่า header `Content-Type` ตอน `axios.post(sendApi)` |
| `authorization` | token สำรอง ใช้เมื่อ LLM Gateway คืน key ไม่ได้ — **ปกติเว้นว่าง** |
| `watermark` | อ่านโดย `buildSeedream1Payload` (`modelDetail.sendConfig?.watermark ?? false`) |
| `stream` | อ่านโดย `buildSeedream1Payload` |

`sendConfig.type` ต้องเป็นค่าเดียวกัน **เป๊ะ ๆ** ทั้ง 3 ที่:
DB row → `payloadBuilders` ที่ worker → `model-registry.ts` + `*-form-renderer.tsx` ที่ frontend

---

## 3. registry ของ payload builder (worker)

[`services/worker-service/src/generate/`](../../services/worker-service/src/generate/)

| ไฟล์ | คีย์ที่ลงทะเบียนอยู่ตอนนี้ |
|---|---|
| `video.service.ts` | `seedance1`, `seedance2` |
| `image.service.ts` | `seedream1`, `seedream2` (Seedream 5.0 Pro — ห้ามส่ง `sequential_image_generation*` / `stream`) |
| `omnihumen.service.ts` | `omnihuman` |
| `dreamactor.service.ts` | `dreamactor` |

รูปแบบเหมือนกันทั้ง 4 ไฟล์:

```ts
// แยก builder แต่ละ model เป็น private method
private readonly payloadBuilders: Record<
  string,
  (body: RequestVideoGenerateDto, modelDetail: any) => any
> = {
  seedance1: this.buildSeedance1Payload.bind(this),
  seedance2: this.buildSeedance2Payload.bind(this),
};

private async buildPayload(body: RequestVideoGenerateDto, sendConfig: any) {
  const builder = this.payloadBuilders[sendConfig?.type];
  if (!builder) {
    // ไม่มี builder = config ใน master_model_type ผิด retry ไปก็ไม่หาย
    throw new UnrecoverableError(
      `Unsupported video sendConfig.type: "${sendConfig?.type}"`,
    );
  }
  return builder(body, sendConfig);
}
```

> `modelDetail` ที่ส่งเข้า builder จริง ๆ แล้วคือ `sendConfig` (ดูจุดเรียก `this.buildPayload(body, sendConfig)`)
> ชื่อพารามิเตอร์กำกวม — omni/dream builder อ่าน `modelDetail.modelType` / `.resolution` / `.seed` / `.fastMode`
> ซึ่งไม่ได้อยู่บน `sendConfig` จริง ๆ จึงตกไปใช้ค่า fallback (`|| 'realman_avatar_picture_omni15_cv'`) เสมอ

### presign object key เสมอ

ทุก reference ที่เป็น object key ของ TOS ต้องแปลงเป็น URL ที่ provider โหลดได้ก่อน:

```ts
await this.storageUrl.toProviderUrl(key)     // ค่าเดียว
await this.storageUrl.toProviderUrls([keys]) // หลายค่า
```

`toProviderUrl` มี guard ในตัว — ถ้าค่าที่ส่งเข้าไปเป็น URL อยู่แล้ว (reference จาก workflow ที่ presign มาแล้ว)
จะส่งต่อตรง ๆ ไม่ presign ซ้ำ และ throw ถ้า presign ไม่ผ่าน (ยอมให้ job fail ดีกว่ายิง URL ว่างไปหา provider)

---

## 4. Flow เต็ม

```
FE  socket.emit("generate:video", payload)
     │
BE core  websocket.gateway.ts  @SubscribeMessage('generate:video')
     └─ GenerateService.createVideoGenerationTask
         └─ GenerateVideoService extends BaseGenerateService.createGenerationTask
             1. validateUserAndProject + logAudit
             2. masterModelTypeRepo.findOne({ modelType: body.model,
                                              type: 'video', isActive: true })
                ↑ ไม่เจอ → 400 "Model not found"
             3. llmGateway.getOrCreateApiKey(organizationId)
                ↑ image/video บังคับมี (usesLlmGateway = true) ไม่มี → 500
             4. checkCreditQuota (modelDetails formula)
             5. gallery + log row + redis credit hold
             6. queue.add(buildQueueJobData(...))
                  { sendApi, sendConfig, statusBaseUrl: taskPollApi, authorization }
     │
BE worker  video.service.ts  @Processor
     1. payload = payloadBuilders[sendConfig.type](body, sendConfig)
     2. axios.post(sendApi, payload, { 'Content-Type': sendConfig.configType,
                                        Authorization: `Bearer ${authorization}` })
     3. videoTaskId = apiRes.data.id  → job.updateData (กัน retry ยิงซ้ำ)
     4. poll GET `${statusBaseUrl}/${videoTaskId}` ทุก taskPollSec
        จนกว่า status === 'succeeded' (timeout 20 นาที)
     5. download → TOS upload → publish redis `worker:*` → core → socket emit
```

---

## 5. Socket events

Gateway: [`services/core/src/websocket/websocket.gateway.ts`](../../services/core/src/websocket/websocket.gateway.ts)

| ขาเข้า | handler | emit เมื่อสำเร็จ | emit เมื่อ error |
|---|---|---|---|
| `generate` | `createImageGenerationTask` | `task:started`, `task:created` | `generate:error` |
| `generate:video` | `createVideoGenerationTask` | `video-task:created`, `task-video:started` | `video-generate:error` |
| `generate:omnihumen` | `createOmnihumenGenerationTask` | `omnihumen-task:created`, `task-omnihumen:started` | `omnihumen-generate:error` |
| `generate:dreamactor` | `createDreamactorGenerationTask` | `dreamactor-task:created`, `task-dreamactor:started` | `dreamactor-generate:error` |

อื่น ๆ: `task:status`, `task:cancel`, `join-room`, `leave-room` — room คือ `${projectId}:video`

worker → core ผ่าน redis pub/sub: `worker:video-started`, `worker:video-progress`, `worker:video-url-success`
(และชุดเทียบเท่าของ image/omnihumen/dreamactor)

---

## 6. Request DTO

[`libs/share/src/types/`](../../libs/share/src/types/) — `video-generate.ts`, `image-generate.ts`,
`omnihumen-generate.ts`, `dreamactor-generate.ts`

```ts
export class RequestVideoGenerateDto {
  taskId: string; model: string; prompt: string;
  image: string[];                  // object key ของ first_frame / last_frame
  sequentialImageGeneration: string; size: string; maxImages: number;
  watermark: boolean; duration: number; ratio: string;
  projectId: string; userId: string; width: number; height: number;
  imageGenerateType: string; typeGenerate: string;
  generateAudio: boolean; draft: boolean; resolution: string;
  organizationId?: string;
  files: { type: 'image' | 'video' | 'audio'; url: string }[];  // เพิ่มมาตอน seedance2
}
```

`model` ในนี้คือ `master_model_type.modelType` ที่ frontend ใส่มาจาก `state.selectedAIModel?.modelType`
— เป็นคีย์ครึ่งหนึ่งของ lookup อีกครึ่งคือ `type` ที่ backend กำหนดเองตาม service

---

## 7. Pricing / credit

[`services/core/src/generate/services/generate-helper.service.ts`](../../services/core/src/generate/services/generate-helper.service.ts) → `getUsedCredit(token, body, model)`

อ่าน `model.modelDetails.calculationType`:

| `calculationType` | ใช้ field | ตัวอย่าง |
|---|---|---|
| `FORMULA` | `creditFormula` | `"body.duration * 42"` |
| `USE_TOKEN` | `tokenFormula` | `"body.duration * 49846.15385"` |
| `NOT_USE_TOKEN` | — | คิดตามจำนวนชิ้น |

สูตรถูก eval ผ่าน `new Function('token','body','pow','abs','min','max','round','ceil','floor','ternary', ...)`
→ ใช้ได้เฉพาะตัวแปร `token`, `body` และ helper ที่ระบุ เท่านั้น

ถ้า `modelDetails` ไม่มี `calculationType` ที่รู้จัก จะตกไป **hardcoded fallback ตาม type**:

| type | สูตร fallback |
|---|---|
| image | `body.images * 10` |
| video | ตาม pixel tier 10/20/40 credit ต่อวินาที (+5 ถ้าเปิด audio) × duration |
| omnihumen | `duration * 45` |
| dreamactor | `duration * 30` |

Preview endpoint ที่ FE เรียกก่อนกด generate: `POST /generate/get-credit-pre-send`

---

## 8. API ที่เกี่ยวกับ model

| Method | Path | ไฟล์ | หมายเหตุ |
|---|---|---|---|
| `GET` | `/ai-models?type=image\|video` | `services/core/src/ai-model/ai-model.controller.ts` | FE picker ใช้อันนี้ — **ไม่กรอง `isActive`** |
| `GET` | `/ai-models/:id` | เดียวกัน | คืน subset ของ field |
| `POST` | `/master-model-type` | `services/core/src/master-model-type/master-model-type.controller.ts` | body = `Prisma.MasterModelTypeCreateInput` ดิบ |
| `GET` | `/master-model-type` | เดียวกัน | กรอง `isActive: true` |
| `GET/PATCH/DELETE` | `/master-model-type/:id` | เดียวกัน | |

Admin UI ที่คุม CRUD นี้: `ai-media-frontend/app/page/admin-management/model-pricing/page.tsx`
— แก้ได้แค่ `name`, `modelType`, `type`, `description`, `isDefault`, `modelDetails`
**ไม่มีช่องกรอก `sendApi` / `sendConfig` / `taskPollApi` / `isActive`** ต้องยิง API หรือแก้ SQL เอง

---

## 9. Gotchas ⚠️

1. **`isActive` default เป็น `false`** — insert row ใหม่แล้วไม่เซ็ต = โมเดลใช้ไม่ได้
2. **`GET /ai-models` ไม่กรอง `isActive`** แต่ `BaseGenerateService` กรอง → โมเดลโผล่ใน dropdown ได้
   แล้วพอกด generate ถึงเจอ `"Model not found"` อาการนี้แปลว่าลืมข้อ 1
3. **lookup key คือคู่ `(modelType, type)`** — `type` ต้องเป็น `image` / `video` / `omnihumen` / `dreamactor` เป๊ะ
4. **seed file stale** — [`libs/prisma/seed/data/master_model_type.json`](../../libs/prisma/seed/data/master_model_type.json)
   ใช้ `type: "vdo"` (ไม่มีวันแมตช์) และไม่มี `sendApi` / `sendConfig` / `isActive` เลย
   ถ้าจะเพิ่ม row ในนั้นต้องใส่ให้ครบและใช้ `"video"`
5. **`GET /ai-models` คืน `sendConfig` ทั้งก้อน** รวม `sendConfig.authorization` → อย่าใส่ token จริงลงไป
   ให้พึ่ง per-org key จาก LLM Gateway แทน
6. **`master-model-type.controller.ts` ไม่มี auth guard** — ระวังตอน expose นอก VPC
7. **คอนเวนชัน 2 row ต่อ 1 model** (1 row ต่อ 1 `description` mode) เช่น id 1/2 และ 3/4 ในไฟล์ seed
8. **`sendConfig.type` ซ้ำได้** ถ้า payload เหมือนกันเป๊ะ — นั่นคือ Case A ใน [MANUAL.md](./MANUAL.md) ที่ไม่ต้องแตะโค้ดเลย

---

## 10. อ้างอิงข้าม repo

ฝั่ง frontend มีเอกสารชุดคู่กันที่ `ai-media-frontend/docs/add-model/`
โมเดลใหม่ที่ต้องเขียน builder ใหม่ **ต้องทำทั้งสองฝั่ง** โดยใช้ `sendConfig.type` ค่าเดียวกัน
