# ตั้งค่า Social Platform (Facebook / Instagram / TikTok / YouTube)

คู่มือสำหรับคนที่ต้องไปกดจริงในคอนโซลของ provider แล้วเอาค่ามาใส่ระบบ
ฟีเจอร์ Public Social **เขียนเสร็จแล้ว** — งานที่เหลือคือสมัคร app กับแต่ละเจ้าและกรอก config

| เอกสาร | ใช้เมื่อ |
|---|---|
| ไฟล์นี้ | ภาพรวม, ลำดับการทำ, ตาราง env ทุกตัว, สิทธิ์, ข้อจำกัดต่อ platform |
| [facebook-instagram.md](./facebook-instagram.md) | Meta app เดียวคุมทั้ง Facebook Page และ Instagram |
| [tiktok.md](./tiktok.md) | TikTok developer app + content-posting audit |
| [youtube.md](./youtube.md) | Google Cloud OAuth client + quota |
| [troubleshooting.md](./troubleshooting.md) | ข้อความ error จริง → สาเหตุ → วิธีแก้ |
| [../../PUBLIC_SOCIAL_SETUP.md](../../PUBLIC_SOCIAL_SETUP.md) | สถาปัตยกรรม, status flow, ตารางในฐานข้อมูล |

---

## ลำดับการทำ

```
1. สร้าง SOCIAL_TOKEN_ENC_KEY แล้วใส่ทั้ง users + worker-service
        ↓
2. สมัคร provider app ทั้ง 3 เจ้า และ "ยื่น review ทันที"  ← กินเวลาเป็นสัปดาห์ ทำก่อนอย่างอื่น
        ↓
3. ระหว่างรอ review → ใช้ manual token (SUPER_ADMIN paste เอง) ทดสอบได้เลย
        ↓
4. review ผ่านเจ้าไหน → เพิ่มชื่อเจ้านั้นใน SOCIAL_ENABLED_PLATFORMS เพื่อเปิดปุ่ม Connect
```

**อย่ารอให้ review ผ่านก่อนถึงจะเริ่มทดสอบ** — เส้นทาง manual token ทำงานได้ตั้งแต่วันแรก
และให้ผลลัพธ์ในฐานข้อมูลเหมือน OAuth ทุกประการ (worker แยกไม่ออก และตั้งใจให้เป็นแบบนั้น)

---

## ตาราง environment variables

### ต้องมีทั้ง users และ worker-service

| Var | ค่า | ถ้าไม่ตั้ง |
|---|---|---|
| `SOCIAL_TOKEN_ENC_KEY` | 32 bytes hex (**64 ตัวอักษร**) | users service **ไม่ start**; worker ไม่เช็คตอน boot แต่จะพังตอน publish |

สร้างด้วย:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

> ⚠️ **key นี้หาย = token ที่เก็บไว้ทุกตัวถอดรหัสไม่ได้** ต้องเชื่อมบัญชีใหม่ทั้งหมด เก็บใน secret manager

### users service เท่านั้น

| Var | ค่า | default | ถ้าไม่ตั้ง |
|---|---|---|---|
| `SOCIAL_ENABLED_PLATFORMS` | `FACEBOOK,INSTAGRAM,TIKTOK,YOUTUBE` (คั่นด้วย comma) | `''` | ปุ่ม Connect ใช้ไม่ได้ → `"X is not enabled in this environment"` **แต่ manual token ยังใช้ได้** |
| `SOCIAL_OAUTH_STATE_SECRET` | สตริงสุ่ม | — | `400 "SOCIAL_OAUTH_STATE_SECRET is not configured"` |
| `SOCIAL_OAUTH_STATE_TTL` | วินาที | `600` | ใช้ 600 |
| `SOCIAL_OAUTH_CALLBACK_BASE_URL` | `https://<api-host>/api/social-account/callback` | — | `400 "SOCIAL_OAUTH_CALLBACK_BASE_URL is not configured"` |
| `SOCIAL_OAUTH_FRONTEND_RETURN_URL` | `https://<web-host>/social-callback` | `${FRONTEND_URL}/social-callback` | ใช้ fallback |
| `META_APP_ID` | จาก Meta | — | OAuth Facebook/Instagram พัง |
| `META_APP_SECRET` | จาก Meta | — | เหมือนกัน |

### worker-service เท่านั้น

| Var | ค่า | default | ผล |
|---|---|---|---|
| `TIKTOK_PRIVACY_LEVEL` | `SELF_ONLY` \| `PUBLIC_TO_EVERYONE` \| … | `SELF_ONLY` | ต้องคง `SELF_ONLY` จนกว่า content-posting audit ผ่าน |
| `YOUTUBE_PRIVACY_STATUS` | `public` \| `unlisted` \| `private` | **`public`** | ⚠️ default ในโค้ดคือ `public` — ตอนทดสอบให้ตั้ง `private` |

### ต้องมีทั้งสอง service (แม้ใช้แค่ manual token)

| Var | default | ทำไม worker ก็ต้องมี |
|---|---|---|
| `META_GRAPH_API_VERSION` | `v21.0` | publisher ของ FB/IG อ่านจาก `process.env` ตรง ๆ |
| `TIKTOK_CLIENT_KEY` | — | `social-token.service.ts` ใช้ refresh token ของ TikTok |
| `TIKTOK_CLIENT_SECRET` | — | เหมือนกัน |
| `GOOGLE_OAUTH_CLIENT_ID` | — | ใช้ refresh token ของ YouTube |
| `GOOGLE_OAUTH_CLIENT_SECRET` | — | เหมือนกัน |

> **จุดที่พลาดบ่อย:** คิดว่า client key/secret ใช้แค่ตอน OAuth แล้วไม่ใส่ที่ worker
> ผลคือ TikTok/YouTube โพสต์ได้ครั้งแรก แล้วพอ token หมดอายุ refresh ไม่ผ่าน
> บัญชีถูก mark `EXPIRED` เงียบ ๆ

### ที่มีอยู่แล้วแต่ social ต้องพึ่ง

`TOS_BUCKET`, `TOS_ACCESS_KEY`, `TOS_SECRET_KEY`, `TOS_REGION`, `TOS_ENDPOINT` —
ใช้ presign URL ของไฟล์ที่จะส่งให้ provider ดึง

---

## ⚠️ Helm chart ยังไม่ได้ wire env เหล่านี้

ตรวจแล้ว: `grep -rniE "SOCIAL_|META_|TIKTOK_|GOOGLE_OAUTH|YOUTUBE_" charts/` **ไม่เจออะไรเลย**
ทั้ง `charts/aicave-user-chart` และ `charts/aicave-worker-chart` และไม่มี `.env.example` ในรีโป

ก่อน deploy ต้องเพิ่ม env ข้างบนเข้า `values.yaml` + `templates/deployment.yaml` ของทั้งสอง chart เอง
โดยให้ค่าที่เป็นความลับ (`*_SECRET`, `SOCIAL_TOKEN_ENC_KEY`, `SOCIAL_OAUTH_STATE_SECRET`)
ไปทาง `secretEnv` ตามคอนเวนชันที่ chart ใช้อยู่ (`DATABASE_URL`, `KEYCLOAK_CLIENT_SECRET`, `OMISE_SECRET_KEY`)

---

## Redirect URI — จุดที่ผิดกันบ่อยที่สุด

โค้ดประกอบ redirect URI เป็น **`<SOCIAL_OAUTH_CALLBACK_BASE_URL>/<PLATFORM ตัวใหญ่>`**

ถ้า `SOCIAL_OAUTH_CALLBACK_BASE_URL=https://api.example.com/api/social-account/callback`
ต้องลงทะเบียนในคอนโซลของแต่ละเจ้าแบบนี้ **เป๊ะ ๆ** (ตัวใหญ่ ไม่มี `/` ปิดท้าย):

```
https://api.example.com/api/social-account/callback/FACEBOOK
https://api.example.com/api/social-account/callback/INSTAGRAM
https://api.example.com/api/social-account/callback/TIKTOK
https://api.example.com/api/social-account/callback/YOUTUBE
```

ผิดตัวเดียว OAuth ล้มทั้ง flow และ error จะมาจาก provider ไม่ใช่จากระบบเรา

---

## สิทธิ์ — ใครทำอะไรได้

| การกระทำ | เงื่อนไข |
|---|---|
| เห็น tab Public Social | `Organization.accessCodes` มีคำว่า `social` |
| เห็นหน้า Connections / Approvals | `OrganizationMember.role` ∈ `OWNER`, `ADMIN` |
| กดปุ่ม **Connect** (OAuth) | org role `OWNER`/`ADMIN` **และ** platform อยู่ใน `SOCIAL_ENABLED_PLATFORMS` |
| กดปุ่ม **Configure token** (manual) | `users.role` ∈ `SUPER_ADMIN`, `SYSTEM_ADMIN` |

> Configure token เป็นปุ่มที่อยู่ใน tab ของโปรเจกต์ **staff จึงต้องสลับเข้าองค์กรของลูกค้าก่อน**
> ถึงจะตั้งค่าให้ได้ (ข้อจำกัดที่รู้อยู่ ไม่ใช่บั๊ก)
>
> หมายเหตุ: frontend เช็คแค่ `SUPER_ADMIN` ส่วน backend รับทั้ง `SUPER_ADMIN` และ `SYSTEM_ADMIN`
> — คนที่เป็น `SYSTEM_ADMIN` จะไม่เห็นปุ่ม แม้ API จะยอมให้เรียก

---

## ข้อจำกัดต่อ platform

ระบบบังคับตั้งแต่ตอนสร้าง share task ถ้าผิดจะขึ้น error ทันทีไม่ต้องรอโพสต์

| Platform | รูป | วิดีโอ | สูงสุด/โพสต์ | caption | ผสมรูป+วิดีโอ |
|---|---|---|---|---|---|
| Facebook | ✅ | ✅ | 10 | 5,000 | ❌ |
| Instagram | ✅ | ✅ | 10 | 2,200 | ✅ |
| TikTok | ❌ | ✅ | **1** | 2,200 | ❌ |
| YouTube | ❌ | ✅ | **1** | 5,000 | ❌ |

เพดานรวมต่อ 1 share task คือ 10 ชิ้น

พฤติกรรมเฉพาะทางที่ควรรู้ก่อนสอนผู้ใช้:

- **Facebook** วิดีโอได้แค่ 1 ชิ้นต่อโพสต์ (รูปหลายชิ้นได้) — ถ้าเลือกวิดีโอปนของอื่นจะขึ้น
  `"Facebook accepts only one video per post"`
- **Instagram** โพสต์วิดีโอเป็น **Reels** เสมอ
- **TikTok** ลิงก์ผลลัพธ์ประกอบจาก display name → **ใส่ display name เป็น handle จริง** ไม่งั้นลิงก์เปิดไม่ได้
- **YouTube** ชื่อคลิป = **บรรทัดแรกของ caption ตัดที่ 100 ตัวอักษร** และ hashtag จะถูกตัด `#` ออกไปเป็น tags
  → สอนผู้ใช้ให้เขียนบรรทัดแรกเป็นชื่อคลิป

---

## 3 เรื่องที่ต้องรู้ก่อนเริ่ม

1. **App review กินเวลาเป็นสัปดาห์** ทั้ง Meta App Review, TikTok content-posting audit
   และ Google OAuth verification — ยื่นให้เร็วที่สุด แล้วใช้ manual token ไปพลางก่อน
2. **YouTube quota**: `videos.insert` = **1,600 units** จากโควตา default 10,000/วัน
   → อัปได้ประมาณ **6 คลิป/วัน** ต้องขอเพิ่มโควตาก่อนใช้งานจริง
3. **`SOCIAL_TOKEN_ENC_KEY` หาย = ต่อบัญชีใหม่ทั้งหมด** ไม่มีทางกู้ token เดิม

---

## ทดสอบว่าตั้งค่าสำเร็จ

แนะนำให้ลอง **Facebook ก่อน** เพราะ Page token ไม่หมดอายุและไม่ต้องรอ audit เหมือน TikTok

1. ตั้ง env ครบ → restart users + worker-service
2. เข้าโปรเจกต์ → tab **Public Social** → **Connections** → **Configure token** (ต้องเป็น SUPER_ADMIN)
3. กรอกตาม [facebook-instagram.md](./facebook-instagram.md) → กดบันทึก
   → ระบบยิงเช็คกับ provider ทันที ถ้าไม่ผ่านจะโชว์ข้อความของ provider ตรง ๆ ใต้หัวข้อ
   "The platform rejected this token"
4. เลือกไฟล์จาก gallery → เขียน caption → เลือกบัญชีปลายทาง → submit
5. OWNER/ADMIN กด **Approve** → กด **Send**
6. เช็คผล: `activity_share_target.status` ต้องเป็น `SUCCESS` และเปิด `remoteUrl` ได้
   (Instagram จะได้ `remoteUrl` เป็น `null` โดยตั้งใจ — ระบบไม่ยิงถาม permalink เพื่อประหยัดโควตา)

ถ้าติดขั้นไหน → [troubleshooting.md](./troubleshooting.md)
