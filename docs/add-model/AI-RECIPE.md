# AI-RECIPE — คำสั่งสำหรับ AI agent เพิ่ม model ใหม่ (Backend)

> **ไฟล์นี้เขียนถึง AI agent โดยตรง** ถ้าคุณเป็นคน ให้อ่าน [MANUAL.md](./MANUAL.md) แทน
> ปฏิบัติตามทีละขั้น ห้ามข้าม ห้ามเดาค่าที่ไม่ได้รับมา

---

## 0. Preconditions — ตรวจ INPUT ก่อนแตะไฟล์ใด ๆ

รวบรวมค่าเหล่านี้จากผู้ใช้ ถ้า field ที่ **บังคับ** ขาดแม้แต่ตัวเดียว → **หยุดแล้วถาม ห้ามเดา**

| Field | บังคับ | ตัวอย่าง | เอาไปทำอะไร |
|---|---|---|---|
| `model_name` | ✅ | `Seedance 3.0 Pro` | `name` |
| `provider_model_id` | ✅ | `seedance-3-0-pro-260601` | `modelType` และ field `model` ใน payload |
| `generation_type` | ✅ | `video` | `type` — ต้องเป็น `image`\|`video`\|`omnihumen`\|`dreamactor` |
| `modes` | ✅ | `["text-to-video","image-to-video"]` | 1 row ต่อ 1 mode → `description` |
| `send_config_type` | ✅ | `seedance3` | คีย์ registry ทั้งระบบ |
| `send_api` | ✅ | `https://ark.../contents/generations/tasks` | `sendApi` |
| `task_poll_api` | ✅ | `https://ark.../contents/generations/tasks` | `taskPollApi` |
| `request_payload_example` | ✅ | JSON body ที่ provider รับ | เขียน builder |
| `response_example` | ✅ | JSON ของ submit + poll | หา path ของ task id / result URL |
| `inputs` | ✅ | `prompt`, `image×2 (first_frame/last_frame)`, `audio×1` | mapping ใน builder |
| `pricing` | ✅ | `FORMULA` + `body.duration * 42` | `modelDetails` |
| `controls` | ✅ | ratio, resolution `[480p,720p,1080p]`, duration `3–15s`, audio, draft | `modelDetails.limitations` (และ frontend `features`) |
| `task_poll_sec` | – | `10` | default `10` |
| `auth_mode` | – | `llm-gateway` | default: per-org key, `sendConfig.authorization` เว้นว่าง |
| `similar_to` | – | `seedance2` | บอกว่าให้ copy builder ตัวไหนเป็นฐาน |
| `is_default` | – | `false` | `isDefault` |

**`request_payload_example` สำคัญที่สุด** — เดา payload ผิด = job ตายที่ worker หลังหักเครดิตไปแล้ว
ถ้าผู้ใช้ให้มาแค่ลิงก์เอกสาร provider ให้ขอ JSON body ตัวอย่างจริง

ถ้า `similar_to` ไม่ได้ระบุ ให้อ่าน builder ที่มีอยู่ทั้งหมดใน
`services/worker-service/src/generate/{video,image,omnihumen,dreamactor}.service.ts`
แล้วเสนอตัวที่ใกล้ที่สุดให้ผู้ใช้ยืนยันก่อนเริ่ม

---

## 1. Decision — Case A / B / C

เทียบ `request_payload_example` กับ output ของ builder ที่มีอยู่:

| ผลเทียบ | Case | ทำต่อที่ |
|---|---|---|
| ตรงกันทุก field | **A** | ทำแค่ Step 2 แล้วจบ ใช้ `sendConfig.type` เดิม (ไม่ต้องสร้าง slug ใหม่) |
| ต่างอย่างน้อย 1 field | **B** | Step 2 → 6 |
| `generation_type` ไม่ใช่ 4 ค่าที่มีอยู่ | **C** | **หยุด** แจ้งผู้ใช้ว่าต้องใช้ [NEW-TAB.md](./NEW-TAB.md) และงานนี้ต้องมีคนรีวิว |

รายงานผลการตัดสินให้ผู้ใช้ทราบก่อนเริ่มแก้ไฟล์

---

## 2. สร้าง body สำหรับ insert row (ห้ามยิงเอง)

สร้าง JSON **1 ก้อนต่อ 1 mode** ใน `modes` แล้ว **พิมพ์ออกมาให้ผู้ใช้ยิงเอง**
(agent ไม่ต้องยิง API เข้า DB จริง นอกจากผู้ใช้สั่งชัดเจน)

```jsonc
{
  "name":        "<model_name>",
  "modelType":   "<provider_model_id>",
  "type":        "<generation_type>",       // image | video | omnihumen | dreamactor
  "description": "<mode>",                  // 1 ก้อนต่อ 1 mode
  "isDefault":   false,
  "isActive":    true,                      // ⚠️ บังคับ default คือ false
  "sendApi":     "<send_api>",
  "taskPollApi": "<task_poll_api>",
  "taskPollSec": 10,
  "sendConfig": {
    "type":          "<send_config_type>",
    "configType":    "application/json",
    "authorization": "",                    // ⚠️ ห้ามใส่ token จริง
    "watermark":     false,
    "stream":        false
  },
  "modelDetails": {
    "status":          "Activated",
    "modelId":         "<provider_model_id>",
    "calculationType": "<FORMULA|USE_TOKEN|NOT_USE_TOKEN>",
    "creditFormula":   "<สูตร>",
    "pricing":         { /* จาก pricing ที่ผู้ใช้ให้ */ },
    "modalities":      { "input": [...], "output": [...] },
    "limitations":     { /* จาก controls */ }
  }
}
```

พร้อมคำสั่งยิง:

```bash
curl -X POST "$CORE_URL/master-model-type" -H 'Content-Type: application/json' -d @model-row-1.json
```

Case A จบที่ขั้นนี้

---

## 3. DTO — เพิ่ม field เฉพาะที่จำเป็น

ถ้า `inputs` มีอะไรที่ `Request<Type>GenerateDto` ยังไม่มี ให้เพิ่มที่
`libs/share/src/types/<generation_type>-generate.ts`

กฎ:
- field ใหม่ต้อง **optional หรือมีค่า default** เพราะ DTO ใช้ร่วมกับโมเดลเดิมทุกตัว
- ห้ามแก้ / ห้ามลบ field เดิม
- ถ้าเพิ่ม field ให้บันทึกไว้ แล้วแจ้งใน output ว่าฝั่ง frontend ต้องเพิ่มใน `XGeneratePayload` ด้วย

ถ้า mapping ทำได้ด้วย field ที่มีอยู่แล้ว → **ข้ามขั้นนี้** อย่าเพิ่ม field โดยไม่จำเป็น

---

## 4. เขียน payload builder

ไฟล์: `services/worker-service/src/generate/<generation_type>.service.ts`
(`video` / `image` / `omnihumen` / `dreamactor` — `generation_type` `omnihumen` ตรงกับ `omnihumen.service.ts`)

### 4.1 อ่าน builder ที่ `similar_to` ชี้ก่อน แล้ว copy โครง

Template:

```ts
private async build<Pascal>Payload(
  body: Request<Type>GenerateDto,
  _modelDetail: any,   // ค่าจริงที่ส่งเข้ามาคือ sendConfig — เปลี่ยนชื่อพารามิเตอร์เป็น modelDetail ถ้าต้องอ่านค่าจากมัน
) {
  // <comment อธิบายว่าโมเดลนี้รองรับ input role อะไรบ้าง และ role ไหนถูกข้าม>
  return {
    model: body.model,
    // ← map จาก request_payload_example ทีละ field
  };
}
```

**กฎบังคับ:**

1. **presign ทุกค่าที่เป็น object key**
   - ใน `video.service.ts` ใช้ `await this.presignRef(value)`
   - ไฟล์อื่นใช้ `await this.storageUrl.toProviderUrl(value)` หรือ `.toProviderUrls([...])`
   - ห้ามส่ง raw object key ไปหา provider เด็ดขาด
2. `model: body.model` เสมอ (ค่านี้คือ `modelType` จาก DB)
3. ค่าที่มาจาก config (เช่น `watermark`, `stream`) อ่านจากพารามิเตอร์ตัวที่สองพร้อม fallback
   แบบเดียวกับ `buildSeedream1Payload`: `modelDetail.sendConfig?.watermark ?? false`
4. input ที่โมเดลไม่รองรับ → **ข้ามเงียบ ๆ พร้อม comment** ห้าม throw
   (ดูตัวอย่าง `buildSeedance1Payload` ที่ `.slice(0, 2)` แล้วอธิบายไว้ใน comment)
5. comment ภาษาไทยหรืออังกฤษก็ได้ ให้ตรงกับ comment รอบ ๆ ในไฟล์เดียวกัน อธิบาย **why** ไม่ใช่ what

### 4.2 ลงทะเบียน — ขั้นนี้ห้ามลืมเด็ดขาด

```ts
private readonly payloadBuilders: Record<...> = {
  <existing keys>,
  '<send_config_type>': this.build<Pascal>Payload.bind(this),
};
```

คีย์ต้อง `=== send_config_type` ที่ใส่ใน DB row ขั้นที่ 2
ลืม = `UnrecoverableError: Unsupported <type> sendConfig.type: "..."` ตอน runtime

---

## 5. poll / response

เทียบ `response_example` กับพฤติกรรม default ของ worker:

| default ปัจจุบัน | ถ้า provider ต่าง ต้องแก้ |
|---|---|
| task id = `apiRes.data.id` | จุด assign `videoTaskId` ใน `process()` |
| poll URL = `` `${statusBaseUrl}/${taskId}` `` | จุดประกอบ `url` ใน while loop |
| จบเมื่อ `status === 'succeeded'` | เงื่อนไข while loop |
| result = `content.video_url` | `interface BytepluseResponse` + จุดอ่านค่า |
| timeout 20 นาที | คงไว้ ห้ามลด |

ถ้าไม่ต่าง → ข้ามขั้นนี้ และระบุใน output ว่า "response shape ตรงกับ default แล้ว"

**ห้ามลบ `job.updateData({ ...job.data, videoTaskId })`** — มันกัน BullMQ retry ยิง submit ซ้ำ
(retry ซ้ำ = generate ใหม่ = เสียเงินจริง)

---

## 6. Verify — ต้องรันจริงก่อนรายงานเสร็จ

```bash
cd ai-media-backend
yarn build
grep -n "<send_config_type>" services/worker-service/src/generate/<generation_type>.service.ts
```

`grep` ต้องเจอ **อย่างน้อย 1 บรรทัดในบล็อก `payloadBuilders`** ถ้าเจอแต่ชื่อ method อย่างเดียว = ลืมลงทะเบียน

ถ้า `yarn build` ล้มเหลว ให้แก้จนผ่าน ห้ามรายงานว่าเสร็จทั้งที่ build ไม่ผ่าน

---

## 7. Output contract — ต้องรายงานครบ 4 ข้อ

1. **Case ที่ตัดสิน** (A/B/C) พร้อมเหตุผลสั้น ๆ ว่าเทียบ payload กับ builder ตัวไหน
2. **สรุปไฟล์ที่แก้** — path + สิ่งที่เพิ่ม บรรทัดละไฟล์
3. **JSON body พร้อมยิง** ทุก mode + คำสั่ง `curl` (บอกชัดว่า agent ยังไม่ได้ยิงให้)
4. **ผลการ verify** — output จริงของ `yarn build` และ `grep` และรายการ manual test ที่ผู้ใช้ต้องทำต่อ
   (generate จริง 1 ครั้ง แล้วเทียบ `payload=` ใน log worker กับ `request_payload_example`)

พร้อมบอกว่า **ฝั่ง frontend ยังไม่เสร็จ** ต้องทำตาม `ai-media-frontend/docs/add-model/AI-RECIPE.md`
ด้วย `send_config_type` ค่าเดียวกัน (โมเดลจะยังไม่โผล่เป็นฟอร์มจนกว่าจะทำ)

---

## 8. Guardrails — ห้ามทำ

- ❌ ห้ามเดา `request_payload_example` หรือ `send_api` — ขาดแล้วหยุดถาม
- ❌ ห้ามใส่ token จริงใน `sendConfig.authorization` (`GET /ai-models` คืนค่านี้ออกไปหา frontend)
- ❌ ห้ามลืม `isActive: true`
- ❌ ห้ามใช้ `type: "vdo"` — ต้องเป็น `"video"`
- ❌ ห้ามสร้าง Prisma migration ถ้าไม่ได้เพิ่มคอลัมน์จริง ๆ
- ❌ ห้ามแตะ `master_model_option`, `master_data_config_api`, `requestBodyMap`, `taskResponseMap`, `optionCode` — dead code ทั้งหมด
- ❌ ห้ามแก้ / refactor builder ของโมเดลเดิม แม้จะเห็นโค้ดซ้ำ — ถ้าเห็นว่าควร refactor ให้เขียนบรรทัดเดียวว่า
  `Suggestion: X would be better because Y — say the word and I'll refactor.`
- ❌ ห้าม `bind` builder ใหม่ทับคีย์เดิมใน `payloadBuilders`
- ❌ ห้ามยิง `POST /master-model-type` เข้า environment จริงเอง ถ้าผู้ใช้ไม่ได้สั่ง
- ❌ ห้ามทิ้ง `TODO` — ถ้าติดอะไรให้รายงานเป็นข้อความ ไม่ใช่ comment ในโค้ด
