# NEW-TAB — เพิ่ม generation type ใหม่ทั้งหมด (Backend, Case C)

> ⚠️ **งานใหญ่ ไม่ใช่งานที่ปล่อยให้ AI ทำจบเองแล้วเมิร์จ**
> เอกสารนี้ใช้เป็นแผนที่ ไม่ใช่สคริปต์ ต้องมีคนรีวิวทุกไฟล์
> ถ้าโมเดลใหม่เข้ากับ 4 type ที่มีอยู่ได้ (`image`/`video`/`omnihumen`/`dreamactor`)
> **อย่าใช้เอกสารนี้** ให้ใช้ [MANUAL.md](./MANUAL.md) แทน

ตัวอย่างสมมติในเอกสารนี้: generation type ใหม่ชื่อ `audio`

---

## เมื่อไหร่ถึงต้องใช้ Case C

ใช้เมื่อ **ทั้งสามข้อ** เป็นจริง:

1. output เป็น media ชนิดใหม่ที่ยังไม่มี tab (เช่น audio / 3d)
2. flow ของเครดิต, gallery, log ไม่เหมือน type ไหนเลย
3. UI ต้องมี tab ของตัวเอง

ถ้าแค่ payload ต่าง → Case B (builder ใหม่) พอ

---

## แผนที่ไฟล์ — Backend

### 1. Queue name

`libs/share/src/constants/index.ts`

```ts
export const QUEUE_NAME_IMAGE = 'image-generate-queue';
export const QUEUE_NAME_VDO = 'vdo-generate-queue';
export const QUEUE_NAME_OMNIHUMEN = 'omnihumen-generate-queue';
export const QUEUE_NAME_DREAMACTOR = 'dreamactor-generate-queue';
export const QUEUE_NAME_AUDIO = 'audio-generate-queue';   // ← เพิ่ม
```

### 2. Request DTO

`libs/share/src/types/audio-generate.ts` — คลาส `RequestAudioGenerateDto`
ดู `video-generate.ts` เป็นแบบ field ที่ทุก type ต้องมี:
`taskId`, `model`, `prompt`, `projectId`, `userId`, `organizationId?`, `typeGenerate`

export ออกจาก `libs/share/src/types/index.ts` (หรือ barrel ที่ไฟล์อื่นใช้อยู่)

### 3. Core — subclass ของ `BaseGenerateService`

`services/core/src/generate/services/generate-audio.service.ts`

`BaseGenerateService` เป็น template method — `createGenerationTask()` คุม flow ทั้งหมด
(validate → lookup model → LLM gateway key → credit → gallery/log → enqueue)
subclass ต้อง implement สมาชิกเหล่านี้:

| สมาชิก | หน้าที่ |
|---|---|
| `protected abstract get modelType(): string` | ค่าที่ใช้ค้น `master_model_type.type` → `'audio'` |
| `protected abstract get queue(): Queue` | คืน queue ที่ `@InjectQueue(QUEUE_NAME_AUDIO)` มา |
| `protected get usesLlmGateway(): boolean` | override เป็น `true` ถ้าบังคับต้องมี per-org key |
| `checkCreditQuota(...)` | ปกติเรียก `this.defaultCheckCreditQuota(...)` ต่อได้เลย |
| `buildQueueJobData(...)` | ต้องพก `sendApi`, `sendConfig`, `statusBaseUrl: modelDetail.taskPollApi`, `authorization` |
| `buildGalleryData(...)` | row ที่จะโชว์ใน gallery |
| `buildLogData(...)` | audit log |
| `buildReturnResponse(...)` | object ที่ตอบกลับผ่าน socket |

โครง constructor ให้ copy จาก `generate-dreamactor.service.ts` (สั้นที่สุดในสี่ตัว)

**`buildQueueJobData` ห้ามลืม `authorization`:**

```ts
authorization: authorization ?? modelDetail?.sendConfig?.authorization ?? null,
```

### 4. Core — facade

`services/core/src/generate/services/generate.service.ts` — เพิ่ม method
`createAudioGenerationTask(...)` ที่ delegate ไป `GenerateAudioService`

### 5. Core — module

`services/core/src/generate/generate.module.ts` — เพิ่ม 3 ที่:

```ts
imports:   [ ..., BullModule.registerQueue({ name: QUEUE_NAME_AUDIO }) ],
providers: [ ..., GenerateAudioService ],
exports:   [ ..., GenerateAudioService ],
```

### 6. Core — websocket gateway

`services/core/src/websocket/websocket.gateway.ts`

```ts
@SubscribeMessage('generate:audio')
async handleAudioGenerate(...) { ... }
```

ตั้งชื่อ event ให้ล้อกับของเดิม:

| ประเภท | รูปแบบเดิม | ของ audio |
|---|---|---|
| created | `video-task:created` | `audio-task:created` |
| started | `task-video:started` | `task-audio:started` |
| error | `video-generate:error` | `audio-generate:error` |

> ⚠️ ของเดิมชื่อสลับกันเอง (`video-task:created` vs `task-video:started`) — ตั้งใจล้อของเดิม
> เพื่อให้ frontend หา pattern ได้ ไม่ใช่ตั้งใหม่ให้สวย

### 7. Worker — processor

`services/worker-service/src/generate/audio.service.ts`

```ts
@Processor(QUEUE_NAME_AUDIO)
export class AudioProcessor extends WorkerHost { ... }
```

ต้องมีครบตามแบบ `video.service.ts`:

- `payloadBuilders` registry + `buildPayload()` ที่ throw `UnrecoverableError` เมื่อไม่เจอคีย์
- `axios.post(sendApi, payload, { headers: { 'Content-Type': sendConfig.configType, Authorization: \`Bearer ${authorization}\` } })`
- `job.updateData({ ...job.data, taskId })` หลังได้ provider task id **(กัน retry ยิงซ้ำ)**
- poll loop ที่มี `POLL_TIMEOUT_MS` (ของเดิม 20 นาที)
- `publishToCore(clientId, 'worker:audio-started' | 'worker:audio-progress' | 'worker:audio-url-success', ...)`
- download → TOS upload → cleanup temp file ใน `finally`
- `onModuleDestroy` ที่ `await this.redisPublisher.quit()`

### 8. Worker — module

`services/worker-service/src/generate/generate.module.ts` — เพิ่ม
`BullModule.registerQueue({ name: QUEUE_NAME_AUDIO })` และใส่ `AudioProcessor` ทั้งใน
`providers` และ `exports` (มี comment `// อย่าลืมใส่ Processor` เตือนไว้แล้วในไฟล์)

### 9. Core — redis subscriber

หาที่ที่ core subscribe channel `worker:*` แล้ว re-emit เข้า socket room
เพิ่ม channel ของ audio และ mapping ไปยัง event ที่ frontend ฟัง

### 10. Pricing fallback

`services/core/src/generate/services/generate-helper.service.ts` → `getUsedCredit`
เพิ่ม branch ของ `audio` ในส่วน hardcoded fallback

> ทางที่ดีกว่า: บังคับให้ทุก row ของ type ใหม่มี `modelDetails.calculationType` เสมอ
> แล้ว fallback แค่ throw / คืน 0 ให้เห็นชัด ๆ ว่า config ขาด

### 11. REST controller (ถ้าต้องการ)

`services/core/src/generate/generate.controller.ts` — endpoint `POST /generate/audio`
**ไม่บังคับ** เพราะ frontend ใช้ socket แต่ endpoint เดิมของ video/omnihumen มีอยู่
(หมายเหตุ: endpoint REST เดิมยัด job เข้า queue ตรง ๆ ไม่ผ่าน flow เครดิต/validate)

### 12. Deploy

`charts/aicave-core-chart` และ `charts/aicave-worker-chart` — bump version ตามคอนเวนชัน repo

---

## Checklist Backend

- [ ] `QUEUE_NAME_AUDIO` ใน `libs/share/src/constants/index.ts`
- [ ] `RequestAudioGenerateDto` + export จาก barrel
- [ ] `GenerateAudioService` implement สมาชิก abstract ครบ 7 ตัว
- [ ] `buildQueueJobData` พก `sendApi` / `sendConfig` / `statusBaseUrl` / `authorization` ครบ
- [ ] `generate.service.ts` facade
- [ ] `generate.module.ts` (core) — imports + providers + exports
- [ ] `@SubscribeMessage('generate:audio')` + emit event ครบ 3 แบบ
- [ ] `AudioProcessor` — registry, retry guard, poll timeout, TOS upload, cleanup
- [ ] `generate.module.ts` (worker) — imports + providers + exports
- [ ] core subscribe redis channel ของ audio แล้ว re-emit
- [ ] pricing fallback / บังคับ `calculationType`
- [ ] `yarn build` ผ่านทั้ง monorepo
- [ ] generate จริง 1 ครั้งจากต้นจนไฟล์ขึ้น gallery + เครดิตถูกหัก + refund ทำงานเมื่อ job fail

---

## ฝั่ง Frontend

Case C ฝั่ง frontend เป็นงานคนละก้อนและใหญ่พอ ๆ กัน
ดู `ai-media-frontend/docs/add-model/NEW-TAB.md`

ทำ backend ให้จบก่อนแล้วค่อยทำ frontend — จะได้ทดสอบ socket event ด้วย
[`docs/example-postman.md`](../example-postman.md) หรือ socket client ธรรมดาก่อนมี UI
