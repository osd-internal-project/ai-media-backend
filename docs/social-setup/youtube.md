# YouTube

ก่อนเริ่ม อ่าน [README.md](./README.md) ให้จบ โดยเฉพาะเรื่อง redirect URI

> ⚠️ **อ่านหัวข้อ [Quota](#quota--อ่านก่อนวางแผนใช้งาน) ก่อนตัดสินใจใช้งานจริง**
> โควตา default อัปได้ประมาณ **6 คลิป/วัน** เท่านั้น

---

## ส่วนที่ 1 — สร้าง OAuth client

1. ไปที่ [console.cloud.google.com](https://console.cloud.google.com) → สร้างหรือเลือกโปรเจกต์
2. **APIs & Services → Library** → เปิดใช้ **YouTube Data API v3**
3. **APIs & Services → OAuth consent screen**
   - User type: **External** (ถ้าไม่ได้ใช้ Google Workspace ภายใน)
   - กรอกชื่อแอป, อีเมลติดต่อ, โลโก้, ลิงก์นโยบายความเป็นส่วนตัว
   - เพิ่ม scope 2 ตัวจากตารางส่วนที่ 2
   - ระหว่างที่ยังเป็น **Testing** ให้เพิ่มบัญชีที่จะใช้เข้า **Test users**
4. **APIs & Services → Credentials → Create credentials → OAuth client ID**
   - Application type: **Web application**
   - **Authorized redirect URIs** ใส่:

     ```
     <SOCIAL_OAUTH_CALLBACK_BASE_URL>/YOUTUBE
     ```

     และถ้าจะใช้ OAuth Playground ดึง refresh token ด้วยมือ ให้เพิ่มอีกบรรทัด:

     ```
     https://developers.google.com/oauthplayground
     ```

5. เก็บค่า:

   | ในคอนโซล | ใส่ใน env |
   |---|---|
   | Client ID | `GOOGLE_OAUTH_CLIENT_ID` |
   | Client secret | `GOOGLE_OAUTH_CLIENT_SECRET` |

   ⚠️ ต้องใส่ **ทั้ง users และ worker-service** — worker ใช้คู่นี้ต่ออายุ token

---

## ส่วนที่ 2 — Scopes

| Scope | ใช้ทำอะไร |
|---|---|
| `https://www.googleapis.com/auth/youtube.upload` | อัปวิดีโอ |
| `https://www.googleapis.com/auth/youtube.readonly` | อ่านรายการ channel เพื่อยืนยันตอนเชื่อมบัญชี |

ทั้งคู่เป็น **sensitive/restricted scope** → ต้องผ่าน **Google OAuth verification** ก่อนใช้กับผู้ใช้นอก Test users
(กระบวนการกินเวลาเป็นสัปดาห์ ยื่นแต่เนิ่น ๆ)

ค่าจริงอยู่ใน `YOUTUBE_SCOPES` ไฟล์ `services/users/src/social-account/oauth/youtube-oauth.provider.ts`

---

## ส่วนที่ 3 — Manual token (ใช้ได้ก่อน verification ผ่าน) ⭐

### 3.1 หา Channel ID

YouTube Studio → **Settings** → **Channel** → **Advanced settings** → คัดลอก **Channel ID**
(ขึ้นต้นด้วย `UC` ยาว 24 ตัวอักษร)

### 3.2 ดึง refresh token

**วิธีที่ง่ายที่สุด — OAuth Playground**

1. เปิด [developers.google.com/oauthplayground](https://developers.google.com/oauthplayground)
2. กดรูปเฟือง ⚙️ → ติ๊ก **Use your own OAuth credentials** → ใส่ Client ID / Client secret ของคุณ
3. ช่องซ้ายเลือกหรือพิมพ์ scope ทั้ง 2 ตัว → **Authorize APIs** → ล็อกอินด้วยบัญชีที่เป็นเจ้าของ channel
4. **Exchange authorization code for tokens** → คัดลอก **Refresh token** และ **Access token**

**วิธีทำเอง**

```
https://accounts.google.com/o/oauth2/v2/auth?client_id=<GOOGLE_OAUTH_CLIENT_ID>&redirect_uri=<SOCIAL_OAUTH_CALLBACK_BASE_URL>/YOUTUBE&response_type=code&scope=https://www.googleapis.com/auth/youtube.upload%20https://www.googleapis.com/auth/youtube.readonly&access_type=offline&prompt=consent
```

`scope` คั่นด้วย **ช่องว่าง** (`%20`) ต่างจาก Meta/TikTok ที่ใช้ comma

แล้วแลก code:

```bash
curl -s -X POST "https://oauth2.googleapis.com/token" \
  -d "client_id=<GOOGLE_OAUTH_CLIENT_ID>" \
  -d "client_secret=<GOOGLE_OAUTH_CLIENT_SECRET>" \
  -d "code=<code>" \
  -d "grant_type=authorization_code" \
  -d "redirect_uri=<SOCIAL_OAUTH_CALLBACK_BASE_URL>/YOUTUBE"
```

> ⚠️ **`access_type=offline` และ `prompt=consent` ขาดไม่ได้**
> ถ้าไม่มี Google จะไม่คืน `refresh_token` และระบบจะปฏิเสธด้วยข้อความ
> `"Google did not return a refresh token — revoke the app in the Google account and reconnect"`
>
> Google คืน refresh token **เฉพาะครั้งแรกที่ให้ consent** ถ้าเคย authorize ไปแล้วและไม่ได้ใส่ `prompt=consent`
> จะไม่ได้ตัวใหม่ → ไปถอนสิทธิ์ที่ [myaccount.google.com/permissions](https://myaccount.google.com/permissions)
> แล้วทำใหม่

### 3.3 กรอกในระบบ

**Public Social** → **Connections** → **Configure token**

| ช่อง | ค่า |
|---|---|
| Platform | `YOUTUBE` |
| Channel ID | `UCxxxxxxxxxxxxxxxxxxxxxx` |
| Access token | access token จากขั้น 3.2 |
| Refresh token | refresh token — **บังคับ** |
| Access token expires at | ปกติ ~1 ชม. นับจากตอนได้มา |
| Display name | ว่างได้ |

คำนวณเวลาหมดอายุ:

```bash
node -e "console.log(new Date(Date.now() + 3600*1000).toISOString())"
```

ระบบยิงเช็คที่ `GET /youtube/v3/channels?part=snippet&mine=true` แล้วดูว่า Channel ID ที่กรอกอยู่ในรายการหรือไม่
ถ้าไม่อยู่จะขึ้น `"This token does not grant access to channel X (it can reach: ...)"`
พร้อมบอกว่า token นั้นเข้าถึง channel ไหนได้บ้าง

---

## ส่วนที่ 4 — เปิด OAuth (หลัง verification ผ่าน)

```bash
SOCIAL_ENABLED_PLATFORMS=FACEBOOK,INSTAGRAM,TIKTOK,YOUTUBE
```

---

## Quota — อ่านก่อนวางแผนใช้งาน

| รายการ | ค่า |
|---|---|
| โควตา default | **10,000 units/วัน** ต่อโปรเจกต์ |
| `videos.insert` (อัป 1 คลิป) | **1,600 units** |
| อัปได้ต่อวัน | **~6 คลิป** |

โควตาเป็นของ **โปรเจกต์ Google Cloud** ไม่ใช่ต่อ channel — ต่อ channel เพิ่มก็ไม่ได้โควตาเพิ่ม

ขอเพิ่มที่ **APIs & Services → YouTube Data API v3 → Quotas** (audit จาก Google กินเวลาหลายสัปดาห์)
**ยื่นก่อนเปิดใช้จริง** ไม่งั้นจะเจอ quota หมดกลางวันทำการ

---

## พฤติกรรมตอนโพสต์ที่ต้องบอกผู้ใช้

### ชื่อคลิป = บรรทัดแรกของ caption

ระบบตัดบรรทัดแรกของ caption ไปเป็น `snippet.title` และ **hard-truncate ที่ 100 ตัวอักษร**
ส่วน caption ทั้งก้อน + link ไปอยู่ใน description

→ สอนผู้ใช้ให้ **เขียนบรรทัดแรกเป็นชื่อคลิป** แล้วเว้นบรรทัด ก่อนเขียนรายละเอียด

### hashtag กลายเป็น tags

`#travel` ที่ผู้ใช้ใส่จะถูกตัด `#` ออกเป็น tag `travel` ตามที่ YouTube API ต้องการ

### privacy default เป็น public

```bash
YOUTUBE_PRIVACY_STATUS=private   # ตอนทดสอบ
```

> ⚠️ ถ้าไม่ตั้ง ค่า default **ในโค้ด** คือ `public` — คลิปทดสอบจะขึ้นสาธารณะทันที
> (`PUBLIC_SOCIAL_SETUP.md` แนะนำ `private` แต่ไม่ใช่ค่า default จริง ต้องตั้งเอง)

ค่าที่ใช้ได้: `public` \| `unlisted` \| `private`

### อื่น ๆ

| เรื่อง | รายละเอียด |
|---|---|
| จำนวนสื่อ | **วิดีโอ 1 ชิ้นเท่านั้น** รูปไม่ได้ |
| caption | สูงสุด 5,000 ตัวอักษร |
| วิธีอัป | resumable upload แต่ส่งไฟล์รวดเดียว (ไม่แบ่ง chunk) — worker โหลดเข้า memory ทั้งก้อน |
| retry | เฉพาะ HTTP 429 และ 5xx เท่านั้น |
| made for kids | ระบบส่ง `selfDeclaredMadeForKids: false` เสมอ |

---

## เรื่อง refresh token

| เรื่อง | รายละเอียด |
|---|---|
| access token | อายุ ~1 ชม. |
| refresh token | ไม่หมดอายุ (ถ้าไม่ถูกถอนสิทธิ์) |
| Google คืน refresh token ใหม่ไหม | **ไม่** — ระบบเก็บตัวเดิมไว้ใช้ต่อ |
| ใช้อะไร refresh | `GOOGLE_OAUTH_CLIENT_ID` + `GOOGLE_OAUTH_CLIENT_SECRET` **จาก env ของ worker-service** |

---

## ถัดไป

- [facebook-instagram.md](./facebook-instagram.md) · [tiktok.md](./tiktok.md)
- ติดปัญหา → [troubleshooting.md](./troubleshooting.md)
