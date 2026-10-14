# Facebook Page + Instagram

**Meta app เดียวคุมทั้งสอง platform** — consent รอบเดียวได้ทั้ง Page และ IG Business ที่ผูกกับ Page นั้น
และทั้งคู่ใช้ **Page access token ตัวเดียวกัน**

ก่อนเริ่ม อ่าน [README.md](./README.md) ให้จบ โดยเฉพาะเรื่อง redirect URI

---

## สิ่งที่ต้องเตรียมฝั่งบัญชี

- **Facebook Page** ที่คุณเป็น admin
- **Instagram** ที่เป็น **Business หรือ Creator account** และ **link กับ Page นั้นแล้ว**
  (IG ส่วนตัวใช้ไม่ได้เด็ดขาด — API ไม่รองรับ)

ตรวจการ link: Facebook Page → Settings → Linked accounts → Instagram

---

## ส่วนที่ 1 — สร้าง Meta app

1. ไปที่ [developers.facebook.com](https://developers.facebook.com) → **My Apps** → **Create App**
2. เลือก use case ที่เข้ากับการโพสต์เนื้อหาลง Page/IG (แนวทาง **Business**)
3. เข้า **App settings → Basic** → เก็บค่า

   | ในคอนโซล | ใส่ใน env |
   |---|---|
   | App ID | `META_APP_ID` |
   | App secret (กด Show) | `META_APP_SECRET` |

4. เพิ่ม product **Facebook Login for Business** → **Settings** →
   ช่อง **Valid OAuth Redirect URIs** ใส่ **2 บรรทัด**:

   ```
   <SOCIAL_OAUTH_CALLBACK_BASE_URL>/FACEBOOK
   <SOCIAL_OAUTH_CALLBACK_BASE_URL>/INSTAGRAM
   ```

   ต้องเป็น **ตัวใหญ่** และไม่มี `/` ปิดท้าย ดูตัวอย่างเต็มใน [README.md](./README.md#redirect-uri--จุดที่ผิดกันบ่อยที่สุด)

5. ตั้ง `META_GRAPH_API_VERSION` ให้ตรงกับเวอร์ชันที่ app ใช้ (default ในโค้ดคือ `v21.0`)

---

## ส่วนที่ 2 — Permissions และ App Review

ระบบขอ scope 6 ตัวนี้ (ค่าจริงอยู่ใน `META_SCOPES`, ไฟล์ `services/users/src/social-account/oauth/meta-oauth.provider.ts`)

| Scope | ใช้ทำอะไร | ต้อง App Review |
|---|---|---|
| `pages_show_list` | ดึงรายการ Page ที่ผู้ใช้ดูแล | ✅ |
| `pages_read_engagement` | อ่านข้อมูล Page | ✅ |
| `pages_manage_posts` | โพสต์ลง Page | ✅ |
| `instagram_basic` | อ่านข้อมูล IG Business | ✅ |
| `instagram_content_publish` | โพสต์ลง IG | ✅ |
| `business_management` | เข้าถึงผ่าน Business Manager | ✅ |

ยื่นที่ **App Review → Permissions and Features** พร้อมวิดีโอสาธิตการใช้งานจริง (Meta บังคับ)
**ยื่นตั้งแต่วันแรก** — ระหว่างรอใช้ manual token ในส่วนที่ 3 ได้เลย

> ระหว่างที่ app ยังอยู่ใน Development mode: เฉพาะคนที่อยู่ในบทบาท admin/developer/tester ของ app
> เท่านั้นที่ให้ consent ได้ ซึ่งเพียงพอสำหรับการทดสอบภายใน

---

## ส่วนที่ 3 — Manual token (ใช้ได้ก่อน review ผ่าน) ⭐

เส้นทางนี้คือสิ่งที่ควรใช้เริ่มต้น ทำใน [Graph API Explorer](https://developers.facebook.com/tools/explorer/)

### 3.1 ขอ user token ชั่วคราว

1. เปิด Graph API Explorer → **Meta App** เลือก app ของคุณ
2. **User or Page** เลือก *User token*
3. **Permissions** ติ๊ก scope ทั้ง 6 ตัวจากตารางข้างบน
4. กด **Generate Access Token** → ยอมรับ consent → ได้ short-lived user token (อายุ ~1 ชม.)

### 3.2 แลกเป็น long-lived user token

```bash
curl -s "https://graph.facebook.com/v21.0/oauth/access_token\
?grant_type=fb_exchange_token\
&client_id=<META_APP_ID>\
&client_secret=<META_APP_SECRET>\
&fb_exchange_token=<short-lived-token>"
```

ได้ user token อายุ ~60 วัน — **ยังไม่ใช่ตัวที่ต้อง paste** ใช้ต่อในขั้น 3.3

### 3.3 ดึง Page ID + Page access token ← ตัวที่ต้องใช้จริง

```bash
curl -s "https://graph.facebook.com/v21.0/me/accounts\
?fields=id,name,access_token,instagram_business_account{id,username}\
&access_token=<long-lived-user-token>"
```

ผลลัพธ์:

```json
{
  "data": [
    {
      "id": "102938475610293",
      "name": "My Brand Page",
      "access_token": "EAAG...",
      "instagram_business_account": { "id": "17841400000000000", "username": "mybrand" }
    }
  ]
}
```

| ค่าที่ได้ | เอาไปทำอะไร |
|---|---|
| `id` | **Page ID** → ช่อง External id ของ FACEBOOK |
| `access_token` | **Page access token** → ช่อง Access token (ทั้ง FACEBOOK และ INSTAGRAM) |
| `instagram_business_account.id` | **IG user ID** → ช่อง External id ของ INSTAGRAM |
| `instagram_business_account.username` | ใช้เป็น Display name ของ IG |

> **Page token ที่ได้จาก long-lived user token จะไม่หมดอายุ** ระบบจึงเก็บ `tokenExpiresAt` เป็น `null`
> และ **ไม่มีการ refresh** — โค้ดปฏิเสธการ refresh token ของ Meta ตรง ๆ
> ถ้าวันหนึ่งใช้ไม่ได้ (เปลี่ยนรหัสผ่าน / ถอนสิทธิ์ / เปลี่ยน admin) ต้องมาทำขั้นตอนนี้ใหม่

ถ้า `instagram_business_account` ไม่โผล่ แปลว่า IG ยังไม่ได้ link กับ Page หรือยังไม่ใช่ Business/Creator
กลับไปแก้ที่บัญชีก่อน

### 3.4 กรอกในระบบ

เข้าโปรเจกต์ → **Public Social** → **Connections** → **Configure token** (ต้องเป็น SUPER_ADMIN)

**Facebook**

| ช่อง | ค่า |
|---|---|
| Platform | `FACEBOOK` |
| Page ID | `id` จากขั้น 3.3 |
| Access token | Page access token |
| Refresh token | *(ไม่แสดงช่องนี้)* |
| Access token expires at | *(ไม่แสดงช่องนี้)* |
| Display name | ว่างได้ — ระบบดึงชื่อ Page มาให้เอง |

**Instagram** — เพิ่มอีก 1 รายการ

| ช่อง | ค่า |
|---|---|
| Platform | `INSTAGRAM` |
| Instagram user ID | `instagram_business_account.id` |
| Access token | **Page access token ตัวเดิม** |
| Display name | ว่างได้ — ระบบดึง `@username` มาให้ |

กดบันทึกแล้วระบบจะยิงเช็คกับ Meta ทันที:

- FACEBOOK → `GET /{page-id}?fields=name,picture{url}`
- INSTAGRAM → `GET /{ig-user-id}?fields=username,profile_picture_url`

ถ้าไม่ผ่านจะขึ้นข้อความของ Meta ตรง ๆ ดูความหมายที่ [troubleshooting.md](./troubleshooting.md)

---

## ส่วนที่ 4 — เปิด OAuth (หลัง review ผ่าน)

เพิ่มใน env ของ users service แล้ว restart:

```bash
SOCIAL_ENABLED_PLATFORMS=FACEBOOK,INSTAGRAM
```

ปุ่ม **Connect** จะใช้ได้ OWNER/ADMIN ขององค์กรกดได้เอง ไม่ต้องพึ่ง SUPER_ADMIN อีก
**consent รอบเดียวสร้างทั้ง 2 row** (Page + IG ที่ผูกอยู่) โดยอัตโนมัติ

---

## ข้อควรระวังตอนโพสต์

### Instagram ต้องดึงไฟล์จาก URL ให้ได้ ← จุดที่น่าจะพังเป็นอย่างแรก

IG ไม่รับ upload ตรง แต่ให้ Meta ไป **ดึงไฟล์จาก URL** ที่เราส่งไป ระบบส่ง presigned TOS URL ไป
แล้ว poll สถานะทุก 3 วินาที นานสุด **5 นาที**

ปัญหา: **Reels ใช้เวลา transcode เป็นนาที** ถ้า presign TTL สั้นกว่านั้น Meta จะดึงไม่ทัน
แล้วขึ้น `"Instagram rejected the media"` — ตรวจ TTL ของ presign ให้ยาวกว่าเวลา transcode มาก ๆ

### อื่น ๆ

| เรื่อง | รายละเอียด |
|---|---|
| Facebook วิดีโอ | ได้ **1 ชิ้นต่อโพสต์** ปนกับอย่างอื่นไม่ได้ → `"Facebook accepts only one video per post"` |
| Facebook หลายรูป | ระบบอัปแบบ unpublished ทีละรูป แล้วรวมเป็นโพสต์เดียว |
| Instagram วิดีโอ | โพสต์เป็น **Reels** เสมอ |
| Instagram หลายชิ้น | เป็น carousel และ **ผสมรูปกับวิดีโอได้** (ต่างจาก platform อื่น) |
| Instagram `remoteUrl` | เป็น `null` เสมอโดยตั้งใจ — ไม่ยิงถาม permalink เพื่อประหยัดโควตา |
| การดึงไฟล์ | FB/IG ให้ provider ดึงจาก URL เอง worker ไม่ต้องโหลดไฟล์ (ต่างจาก TikTok/YouTube) |

---

## ถัดไป

- [tiktok.md](./tiktok.md) · [youtube.md](./youtube.md)
- ติดปัญหา → [troubleshooting.md](./troubleshooting.md)
