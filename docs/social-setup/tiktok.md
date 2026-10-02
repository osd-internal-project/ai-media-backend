# TikTok

ก่อนเริ่ม อ่าน [README.md](./README.md) ให้จบ โดยเฉพาะเรื่อง redirect URI

> **TikTok เป็นเจ้าที่ตั้งค่ายากที่สุดใน 4 เจ้า** — access token อายุ ~24 ชม. จึง **บังคับต้องมี refresh token**
> และโพสต์สาธารณะไม่ได้จนกว่าจะผ่าน content-posting audit
> ถ้าเพิ่งเริ่มทำฟีเจอร์นี้ ให้ทำ [Facebook](./facebook-instagram.md) ให้ผ่านก่อน

---

## ส่วนที่ 1 — สร้าง app

1. ไปที่ [developers.tiktok.com](https://developers.tiktok.com) → **Manage apps** → สร้าง app ใหม่
2. เก็บค่าจากหน้า app:

   | ในคอนโซล | ใส่ใน env |
   |---|---|
   | Client key | `TIKTOK_CLIENT_KEY` |
   | Client secret | `TIKTOK_CLIENT_SECRET` |

   ⚠️ ต้องใส่ **ทั้ง users และ worker-service** — worker ใช้คู่นี้ต่ออายุ token
   (ดู [README.md](./README.md#ต้องมีทั้งสอง-service-แม้ใช้แค่-manual-token))

3. เพิ่ม product **Login Kit** และ **Content Posting API**
4. ตั้ง **Redirect URI**:

   ```
   <SOCIAL_OAUTH_CALLBACK_BASE_URL>/TIKTOK
   ```

---

## ส่วนที่ 2 — Scopes และ audit

ระบบขอ 3 scope นี้ (`TIKTOK_SCOPES` ใน `services/users/src/social-account/oauth/tiktok-oauth.provider.ts`)

| Scope | ใช้ทำอะไร |
|---|---|
| `user.info.basic` | ดึง `open_id`, display name, avatar |
| `video.upload` | อัปไฟล์วิดีโอ |
| `video.publish` | สั่งเผยแพร่ |

### Content-posting audit

จนกว่า audit จะผ่าน app **โพสต์สาธารณะไม่ได้เลย** — ต้องคง

```bash
TIKTOK_PRIVACY_LEVEL=SELF_ONLY
```

โพสต์ที่ออกไปจะเห็นได้เฉพาะเจ้าของบัญชี ซึ่ง **เพียงพอสำหรับการทดสอบ** ว่า pipeline ทำงานครบ
พอ audit ผ่านค่อยเปลี่ยนเป็น `PUBLIC_TO_EVERYONE`

> โพสต์แบบ `SELF_ONLY` TikTok จะไม่คืน public post id ระบบจึงเก็บ `remoteUrl` เป็น `null`
> และใช้ publish id เป็น `remotePostId` แทน — **เป็นพฤติกรรมปกติ ไม่ใช่ error**

---

## ส่วนที่ 3 — Manual token (ใช้ได้ก่อน audit ผ่าน) ⭐

TikTok ไม่มีเครื่องมือแบบ Graph API Explorer ต้องเดิน OAuth ด้วยมือ

### 3.1 เปิด authorize URL ในเบราว์เซอร์

แทนค่าแล้วเปิด:

```
https://www.tiktok.com/v2/auth/authorize/?client_key=<TIKTOK_CLIENT_KEY>&response_type=code&scope=user.info.basic,video.publish,video.upload&redirect_uri=<SOCIAL_OAUTH_CALLBACK_BASE_URL>/TIKTOK&state=manual
```

`scope` คั่นด้วย **comma** และ `redirect_uri` ต้องตรงกับที่ลงทะเบียนไว้เป๊ะ ๆ

ล็อกอินและกดอนุญาต → เบราว์เซอร์จะเด้งไป redirect URI พร้อม `?code=...`
**คัดลอก `code` ทันที** — อายุสั้นมาก (ใช้ได้ครั้งเดียว ไม่กี่นาที)

### 3.2 แลก code เป็น token

```bash
curl -s -X POST "https://open.tiktokapis.com/v2/oauth/token/" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "client_key=<TIKTOK_CLIENT_KEY>" \
  -d "client_secret=<TIKTOK_CLIENT_SECRET>" \
  -d "code=<code จากขั้น 3.1>" \
  -d "grant_type=authorization_code" \
  -d "redirect_uri=<SOCIAL_OAUTH_CALLBACK_BASE_URL>/TIKTOK"
```

ได้:

```json
{
  "open_id": "abc123...",
  "access_token": "act.xxx",
  "expires_in": 86400,
  "refresh_token": "rft.xxx",
  "refresh_expires_in": 31536000,
  "scope": "user.info.basic,video.publish,video.upload"
}
```

> ⚠️ **TikTok คืน HTTP 200 แม้ตอนพลาด** โดยใส่ field `error` มาแทน
> ถ้าเห็น `"error"` ในผลลัพธ์แปลว่าไม่สำเร็จ อย่าเอาไปกรอกต่อ

| ค่า | เอาไปใส่ |
|---|---|
| `open_id` | ช่อง **open_id** |
| `access_token` | ช่อง **Access token** |
| `refresh_token` | ช่อง **Refresh token** ← **ห้ามเว้น** |
| `expires_in` | คำนวณเป็นเวลาจริงใส่ช่อง **Access token expires at** |

คำนวณเวลาหมดอายุ:

```bash
node -e "console.log(new Date(Date.now() + 86400*1000).toISOString())"
```

### 3.3 กรอกในระบบ

**Public Social** → **Connections** → **Configure token**

| ช่อง | ค่า |
|---|---|
| Platform | `TIKTOK` |
| open_id | `open_id` |
| Access token | `access_token` |
| Refresh token | `refresh_token` — **บังคับ** |
| Access token expires at | เวลาจากขั้น 3.2 |
| Display name | **ใส่ handle จริง** เช่น `mybrand` (ดูเหตุผลข้างล่าง) |

ระบบยิงเช็คกับ TikTok ทันทีที่ `GET /v2/user/info/` และเทียบว่า `open_id` ที่คืนมาตรงกับที่กรอกหรือไม่
ถ้าไม่ตรงจะขึ้น `"This token belongs to open_id X, not Y"`

### ทำไม display name ต้องเป็น handle จริง

ลิงก์ผลลัพธ์ถูกประกอบเป็น:

```
https://www.tiktok.com/@{displayName}/video/{postId}
```

ถ้าใส่เป็นชื่อแบรนด์ที่มีเว้นวรรค ลิงก์ที่ผู้ใช้เห็นจะกดไม่ได้

---

## ส่วนที่ 4 — เปิด OAuth (หลัง audit ผ่าน)

```bash
SOCIAL_ENABLED_PLATFORMS=FACEBOOK,INSTAGRAM,TIKTOK
```

พร้อมเปลี่ยนที่ worker-service:

```bash
TIKTOK_PRIVACY_LEVEL=PUBLIC_TO_EVERYONE
```

---

## เรื่อง refresh token

| เรื่อง | รายละเอียด |
|---|---|
| access token | อายุ ~24 ชม. |
| refresh token | อายุ ~1 ปี |
| ระบบ refresh เมื่อไหร่ | ก่อนหมดอายุ 5 นาที ตอนกำลังจะโพสต์ |
| ใช้อะไร refresh | `TIKTOK_CLIENT_KEY` + `TIKTOK_CLIENT_SECRET` **จาก env ของ worker-service** |
| TikTok คืน refresh token ใหม่ | ใช่ — ระบบเขียนทับตัวเดิมให้อัตโนมัติ |
| ถ้า refresh ไม่ผ่าน | บัญชีถูก mark `EXPIRED` และขึ้นแบนเนอร์ "Reconnect needed" ในหน้า Connections |

**สาเหตุอันดับหนึ่งที่ refresh พัง: worker-service ไม่มี `TIKTOK_CLIENT_KEY` / `TIKTOK_CLIENT_SECRET`**
อาการคือโพสต์ได้วันแรก แล้ววันถัดมาตายเงียบ ๆ

---

## ข้อจำกัดตอนโพสต์

| เรื่อง | รายละเอียด |
|---|---|
| จำนวนสื่อ | **วิดีโอ 1 ชิ้นเท่านั้น** รูปไม่ได้ → `"TikTok only accepts a single video"` |
| caption | สูงสุด 2,200 ตัวอักษร |
| วิธีอัป | **FILE_UPLOAD** — worker โหลดไฟล์เข้า memory ทั้งก้อนแล้วส่ง (ไม่ใช้ PULL_FROM_URL เพราะต้องยืนยันความเป็นเจ้าของโดเมน TOS ซึ่งเราไม่ได้ถือ) |
| poll | ทุก 3 วินาที นานสุด 5 นาที |
| timeout | ถือเป็น retryable → BullMQ ลองใหม่ให้ |

---

## ถัดไป

- [youtube.md](./youtube.md) · [facebook-instagram.md](./facebook-instagram.md)
- ติดปัญหา → [troubleshooting.md](./troubleshooting.md)
