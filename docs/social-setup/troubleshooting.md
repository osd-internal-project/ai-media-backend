# Troubleshooting

ข้อความทั้งหมดในหน้านี้เป็น **string จริงจากโค้ด** ค้นหาด้วยคำที่เห็นบนหน้าจอได้เลย

---

## 1. ตอนตั้ง env / เปิดหน้า Connections

| ข้อความ | สาเหตุ | วิธีแก้ |
|---|---|---|
| `<PLATFORM> is not enabled in this environment` | platform ไม่อยู่ใน `SOCIAL_ENABLED_PLATFORMS` | เพิ่มชื่อ platform (ตัวใหญ่ คั่น comma) แล้ว restart users service — **หรือใช้ Configure token แทน ซึ่งไม่ถูก gate ด้วยตัวแปรนี้** |
| `SOCIAL_OAUTH_STATE_SECRET is not configured` | ไม่ได้ตั้ง env ตัวนี้ | ตั้งเป็นสตริงสุ่มใน users service |
| `SOCIAL_OAUTH_CALLBACK_BASE_URL is not configured` | ไม่ได้ตั้ง env ตัวนี้ | ตั้งเป็น `https://<api-host>/api/social-account/callback` |
| `SOCIAL_TOKEN_ENC_KEY is not set — cannot encrypt social account tokens` | ไม่ได้ตั้ง key | สร้างด้วย `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `SOCIAL_TOKEN_ENC_KEY must be 32 bytes hex-encoded (64 hex chars), got N bytes` | key ยาวผิด | ต้องเป็น hex 64 ตัวอักษรพอดี |
| users service ไม่ยอม start | key ไม่ถูกต้อง — service assert ตอน boot | แก้ key ให้ถูก |
| ไม่เห็น tab Public Social เลย | `Organization.accessCodes` ไม่มีคำว่า `social` | เพิ่ม access code ให้องค์กร |
| เห็น tab แต่ไม่มีปุ่ม Configure token | `users.role` ไม่ใช่ `SUPER_ADMIN` | frontend เช็คแค่ `SUPER_ADMIN` (backend รับ `SYSTEM_ADMIN` ด้วยแต่ปุ่มไม่โผล่) |
| `Only a system administrator can configure tokens manually` | เรียก API ด้วยบัญชีที่ไม่ใช่ SUPER_ADMIN/SYSTEM_ADMIN | ใช้บัญชี staff |
| `Only an organization OWNER or ADMIN can manage social accounts` | org role ไม่พอ | ให้ OWNER/ADMIN ขององค์กรนั้นทำแทน |

---

## 2. ตอนกรอก Configure token (verify ไม่ผ่าน)

ระบบยิงเช็คกับ provider **ก่อนบันทึกเสมอ** ข้อความที่ขึ้นใต้ "The platform rejected this token"
ส่วนใหญ่มาจาก provider ตรง ๆ

### Facebook / Instagram

| ข้อความ | สาเหตุ | วิธีแก้ |
|---|---|---|
| `This token cannot read Facebook Page <id> — make sure it is a Page access token, not a user token` | paste user token แทน Page token | ทำขั้น 3.3 ใน [facebook-instagram.md](./facebook-instagram.md) เอา `access_token` จาก `/me/accounts` |
| `This token cannot read Instagram account <id> — check that it is an Instagram Business account linked to a Page` | IG ยังไม่ได้ link กับ Page หรือยังเป็นบัญชีส่วนตัว | เปลี่ยน IG เป็น Business/Creator แล้ว link กับ Page |
| `Facebook rejected the token: Invalid OAuth access token` | token หมดอายุ / ผิด / คัดลอกไม่ครบ | สร้างใหม่ |
| `Facebook rejected the token: ...` (ข้อความอื่น) | Meta ปฏิเสธด้วยเหตุอื่น | อ่านข้อความของ Meta ตรง ๆ มักเป็นเรื่อง scope ไม่ครบ |

### TikTok

| ข้อความ | สาเหตุ | วิธีแก้ |
|---|---|---|
| `This token belongs to open_id X, not Y` | `open_id` ที่กรอกไม่ตรงกับเจ้าของ token | ใช้ `open_id` ที่ได้จาก response ตอนแลก code |
| `TikTok rejected the token: ...` | token ผิด/หมดอายุ (access token อายุ ~24 ชม.) | ทำ OAuth ใหม่ตาม [tiktok.md](./tiktok.md) ขั้น 3 |
| `TikTok did not return a user for this token` | token ใช้ไม่ได้ หรือ scope ไม่มี `user.info.basic` | ขอ scope ให้ครบทั้ง 3 ตัว |
| `TikTok token request failed: ...` | แลก code ไม่ผ่าน | code หมดอายุแล้ว (อายุไม่กี่นาที ใช้ได้ครั้งเดียว) — เริ่มจากขั้น 3.1 ใหม่ |

### YouTube

| ข้อความ | สาเหตุ | วิธีแก้ |
|---|---|---|
| `This token does not grant access to channel X (it can reach: ...)` | Channel ID ผิด หรือล็อกอินผิดบัญชี | ใช้ channel id ที่ระบบบอกว่าเข้าถึงได้ หรือ authorize ใหม่ด้วยบัญชีเจ้าของ channel |
| `This Google account has no YouTube channel` | บัญชีที่ authorize ไม่มี channel | ใช้บัญชีอื่น หรือสร้าง channel ก่อน |
| `This token has no YouTube channel attached` | เหมือนกัน (เจอตอน verify manual) | เหมือนกัน |
| `Google did not return a refresh token — revoke the app in the Google account and reconnect` | ขาด `access_type=offline` / `prompt=consent` หรือเคย authorize ไปแล้ว | ถอนสิทธิ์ที่ [myaccount.google.com/permissions](https://myaccount.google.com/permissions) แล้วทำใหม่โดยใส่ทั้ง 2 พารามิเตอร์ |
| `Google did not return an access token` | แลก code ไม่ผ่าน | code หมดอายุ หรือ `redirect_uri` ไม่ตรงกับที่ลงทะเบียน |
| `Google rejected the token: ...` | Google ปฏิเสธ token | อ่านข้อความของ Google ตรง ๆ มักเป็น token หมดอายุหรือ scope ไม่ครบ |

### ทั่วไป

| ข้อความ | สาเหตุ |
|---|---|
| `An access token is required when adding a new account` | เว้นช่อง token ตอนเพิ่มรายการใหม่ (เว้นได้เฉพาะตอน **แก้ไข** รายการเดิม) |
| `Could not verify the token: ...` | ยิงไปหา provider แล้วมีปัญหาเครือข่าย/รูปแบบ |

---

## 3. ตอนทำ OAuth (ปุ่ม Connect)

| ข้อความ | สาเหตุ | วิธีแก้ |
|---|---|---|
| provider ขึ้นว่า redirect URI ไม่ถูกต้อง | URI ในคอนโซลไม่ตรงกับที่โค้ดสร้าง | ต้องเป็น `<SOCIAL_OAUTH_CALLBACK_BASE_URL>/FACEBOOK` **ตัวใหญ่** ไม่มี `/` ปิดท้าย |
| `Invalid or expired OAuth state` | ปล่อยหน้า consent ค้างนานเกิน `SOCIAL_OAUTH_STATE_TTL` (default 600 วิ) | กด Connect ใหม่ |
| `OAuth state does not match the platform` | เปิด popup ค้างไว้หลายอันแล้วสลับกัน | ปิดทุก popup แล้วเริ่มใหม่ทีละอัน |
| `No postable account was found for this login` | บัญชีที่ล็อกอินไม่มี Page/channel ที่โพสต์ได้ | ใช้บัญชีที่เป็น admin ของ Page |
| `Meta did not return an access token` | แลก code ไม่ผ่าน | เช็ค `META_APP_ID` / `META_APP_SECRET` และ redirect URI |
| popup ปิดแล้วแต่ไม่มีอะไรเกิดขึ้น | callback เด้งไป `SOCIAL_OAUTH_FRONTEND_RETURN_URL` ที่ผิด | ตั้งให้ชี้ `https://<web-host>/social-callback` |

---

## 4. ตอนสร้าง share task (บล็อกก่อนโพสต์)

ระบบตรวจ `PLATFORM_CAPABILITIES` ตั้งแต่ตอนสร้าง ดูตารางเต็มใน [README.md](./README.md#ข้อจำกัดต่อ-platform)

| ข้อความ | ความหมาย |
|---|---|
| `TIKTOK only accepts video posts` / `YOUTUBE only accepts video posts` | เลือกรูปให้ platform ที่รับแต่วิดีโอ |
| `<PLATFORM> does not accept video posts` | เลือกวิดีโอให้ platform ที่รับแต่รูป |
| `<PLATFORM> cannot mix images and video in one post` | ผสมรูปกับวิดีโอ — มีแต่ Instagram ที่ทำได้ |
| `Gallery item X does not exist in this project` | อ้างถึงไฟล์ที่ไม่ได้อยู่ในโปรเจกต์นี้ |
| `Gallery item X has no generated file yet` | งาน generate ยังไม่เสร็จ |
| `A share in status X can no longer be edited` / `deleted` | แก้ได้เฉพาะสถานะ `NEW` และ `REJECTED` |
| `Cannot move a share from X to Y` | ทำ transition ที่ไม่อนุญาต (ดู status flow ใน [PUBLIC_SOCIAL_SETUP.md](../../PUBLIC_SOCIAL_SETUP.md)) |

---

## 5. ตอนโพสต์จริง (worker)

### token / บัญชี

| ข้อความ | สาเหตุ | วิธีแก้ |
|---|---|---|
| `Token for this X account expired and could not be refreshed — reconnect the account` | refresh ไม่ผ่าน — บัญชีถูก mark `EXPIRED` | **เช็คก่อนเลยว่า worker-service มี `TIKTOK_CLIENT_KEY/SECRET` และ `GOOGLE_OAUTH_CLIENT_ID/SECRET` ครบไหม** นี่คือสาเหตุอันดับหนึ่ง |
| `no refresh token stored` | ไม่ได้กรอก refresh token ตอน Configure token | TikTok/YouTube **บังคับต้องมี** กรอกเพิ่ม |
| `Meta tokens cannot be refreshed programmatically` | ระบบพยายาม refresh token ของ FB/IG | Page token ไม่ควรหมดอายุ ถ้ามาถึงตรงนี้แปลว่า token ถูกถอนสิทธิ์ — ต้องสร้าง Page token ใหม่ |
| `Social account "X" was disconnected — reconnect it to publish` | บัญชีถูก disconnect ไปแล้ว (`status = REVOKED`) | เชื่อมใหม่ |
| `Social account X not found` | บัญชีถูกลบ | เชื่อมใหม่ |

### Instagram

| ข้อความ | สาเหตุ | วิธีแก้ |
|---|---|---|
| `Instagram rejected the media: ERROR` / `EXPIRED` | Meta ดึงไฟล์จาก presigned URL ไม่สำเร็จ | **สาเหตุที่พบบ่อยที่สุดคือ presign TTL หมดก่อน Meta ดึงเสร็จ** — Reels transcode นานเป็นนาที ให้ยืด TTL ของ TOS presign |
| `Instagram did not finish processing the media in time` | poll ครบ 5 นาทีแล้วยังไม่เสร็จ | retryable — ระบบลองใหม่ให้ ถ้าเกิดซ้ำ ๆ แปลว่าไฟล์ใหญ่/ยาวเกินไป |
| `instagram container X for Y did not finish in time` | เหมือนกัน (ข้อความใน log) | เหมือนกัน |

### Facebook

| ข้อความ | สาเหตุ |
|---|---|
| `Facebook accepts only one video per post` | เลือกวิดีโอมากกว่า 1 หรือปนกับสื่ออื่น |

### TikTok

| ข้อความ | สาเหตุ | วิธีแก้ |
|---|---|---|
| `TikTok only accepts a single video` | เลือกมากกว่า 1 ชิ้น หรือเป็นรูป | |
| `TikTok rejected the video: <fail_reason>` | TikTok ปฏิเสธไฟล์ | อ่าน `fail_reason` — มักเป็นเรื่องรูปแบบ/ความยาววิดีโอ |
| `TikTok did not return an upload URL: ...` | init ไม่ผ่าน | เช็ค scope `video.upload` และสถานะ audit |
| `TikTok did not finish processing the video in time` | poll ครบ 5 นาที | retryable |
| โพสต์สำเร็จแต่ `remoteUrl` เป็น `null` | โพสต์แบบ `SELF_ONLY` TikTok ไม่คืน public post id | **ปกติ ไม่ใช่ error** — เปลี่ยนเป็น `PUBLIC_TO_EVERYONE` ได้หลัง audit ผ่าน |
| ลิงก์ผลลัพธ์กดไม่ได้ | `remoteUrl` ประกอบจาก display name | ใส่ display name เป็น handle จริง |

### YouTube

| ข้อความ | สาเหตุ | วิธีแก้ |
|---|---|---|
| `YouTube only accepts a single video` | เลือกมากกว่า 1 ชิ้น หรือเป็นรูป | |
| `YouTube rejected the upload session (403): ... quotaExceeded` | โควตาหมด (1,600 units/คลิป จาก 10,000/วัน ≈ 6 คลิป) | รอวันถัดไป หรือขอเพิ่มโควตา |
| `YouTube did not return a resumable upload URL` | ไม่ได้ header `Location` | retryable — ถ้าเกิดซ้ำเช็ค scope `youtube.upload` |
| `YouTube did not return a video id` | อัปเสร็จแต่ response ผิดรูป | ตรวจใน YouTube Studio ว่าคลิปขึ้นหรือไม่ก่อนลองใหม่ |
| คลิปขึ้นสาธารณะทั้งที่ยังทดสอบ | `YOUTUBE_PRIVACY_STATUS` ไม่ได้ตั้ง — default ในโค้ดคือ `public` | ตั้ง `YOUTUBE_PRIVACY_STATUS=private` |
| ชื่อคลิปเป็นข้อความแปลก ๆ | title = บรรทัดแรกของ caption ตัดที่ 100 ตัวอักษร | สอนผู้ใช้เขียนบรรทัดแรกเป็นชื่อคลิป |

### ทั่วไป

| ข้อความ | สาเหตุ |
|---|---|
| `Could not download the media file (<status>)` | worker โหลดไฟล์จาก TOS ไม่ได้ — เช็ค `TOS_*` และ presign TTL |
| `No publisher registered for <platform>` | platform ในฐานข้อมูลไม่ใช่ 1 ใน 4 ค่าที่รองรับ |
| `activity share X no longer exists` | share ถูกลบระหว่างที่ job รออยู่ในคิว |

---

## 6. จะดูอะไรตอนโพสต์ไม่ผ่าน

เรียงตามลำดับที่ควรดู:

1. **`activity_share_target`** — ดูรายบัญชีปลายทาง
   `status`, `errorCode`, `errorMessage`, `attemptCount`
2. **`activity_share_log`** — ประวัติทุก transition แบบ append-only
   ช่อง `metadata` (JsonB) เก็บ **payload ดิบที่ provider ตอบกลับมา** ซึ่งมีรายละเอียดมากกว่าที่โชว์บน UI
   `actorType` เป็น `SYSTEM` เมื่อ worker เป็นคนเขียน
3. **log ของ worker-service** — ข้อความ error พร้อมบริบท

### เรื่อง Retry

- Retry **ยิงซ้ำเฉพาะ target ที่เป็น `FAILED`** ตัวที่ `SUCCESS` แล้วไม่ถูกแตะ → **โพสต์ซ้ำไม่ได้**
- error แบ่งเป็น retryable / non-retryable
  - **retryable**: HTTP 429, 5xx, network error, timeout ตอน poll → BullMQ ลองใหม่เอง
  - **non-retryable**: config ผิด, media ผิดชนิด, provider ปฏิเสธเนื้อหา → แก้ต้นเหตุก่อนแล้วค่อยกด Retry
- ปุ่ม Send มี guard กัน double-click อยู่แล้ว (conditional update) กดซ้ำไม่ทำให้โพสต์ 2 รอบ

---

## 7. เช็คลิสต์เร็ว ๆ เมื่อ "ตั้งค่าครบแล้วแต่ยังโพสต์ไม่ได้"

- [ ] `SOCIAL_TOKEN_ENC_KEY` **ค่าเดียวกัน** ทั้ง users และ worker-service
- [ ] worker-service มี `TIKTOK_CLIENT_KEY/SECRET` + `GOOGLE_OAUTH_CLIENT_ID/SECRET` (ไม่ใช่แค่ users)
- [ ] worker-service มี `META_GRAPH_API_VERSION`
- [ ] `TOS_*` ครบ และ presign TTL ยาวพอสำหรับ IG
- [ ] บัญชีในหน้า Connections เป็น `Active` ไม่ใช่ `Reconnect needed`
- [ ] TikTok/YouTube กรอก refresh token แล้ว
- [ ] Helm chart ของทั้งสอง service ส่ง env เหล่านี้เข้าไปจริง (ดู [README.md](./README.md#️-helm-chart-ยังไม่ได้-wire-env-เหล่านี้) — ตอนนี้ยังไม่มีใน chart)
