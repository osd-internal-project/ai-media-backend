---
description: เพิ่ม AI generation model ใหม่เข้าระบบ (backend — DB row + worker payload builder)
argument-hint: [ชื่อ model หรือ path ของไฟล์ input ที่กรอกแล้ว]
---

เพิ่ม AI generation model ใหม่เข้า ai-cave ฝั่ง backend

ข้อมูลจากผู้ใช้: $ARGUMENTS

## ทำตามลำดับนี้

1. **อ่าน `docs/add-model/AI-RECIPE.md` ให้จบก่อน** แล้วทำตามทุกขั้นในนั้น
   ไฟล์นั้นคือ spec ของงานนี้ ไม่ใช่ข้อเสนอแนะ

2. ถ้า `$ARGUMENTS` เป็น path ของไฟล์ ให้อ่านไฟล์นั้นเป็น INPUT
   ถ้าเป็นแค่ชื่อ model หรือว่างเปล่า ให้ถามผู้ใช้ตาม INPUT SPEC ใน recipe

3. **ห้ามเดา field ที่บังคับ** โดยเฉพาะ `request_payload_example`, `send_api`, `task_poll_api`
   ขาดตัวไหน → หยุดถามก่อน อย่าเดาแล้วเขียนโค้ดต่อ

4. ตัดสิน Case (A / B / C) แล้วรายงานให้ผู้ใช้ทราบก่อนเริ่มแก้ไฟล์

5. ทำตาม Step ใน recipe จนครบ แล้วรัน verify จริง (`yarn build` + `grep`)

6. รายงานตาม Output contract ในข้อ 7 ของ recipe ให้ครบทั้ง 4 ข้อ

## เตือนเสมอ

- อย่ายิง `POST /master-model-type` เข้า environment จริงเอง — พิมพ์ JSON + คำสั่ง curl ให้ผู้ใช้ยิง
- ปิดท้ายด้วยการบอกว่า **ฝั่ง frontend ยังไม่เสร็จ** ต้องทำที่ repo `ai-media-frontend`
  ด้วย `send_config_type` ค่าเดียวกัน ไม่งั้นโมเดลจะยังไม่มีฟอร์มให้ใช้
