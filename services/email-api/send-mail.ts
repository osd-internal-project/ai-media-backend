// send-mail.ts — สรุปการส่ง email ผ่าน relay osd.co.th (Office 365 direct-send)
import * as nodemailer from 'nodemailer';

/* ──────────────────────────────────────────────────────────────────────────
 * 1) CONFIG — เลือก target ที่จะส่ง
 *    relay จริงคือ 103.197.245.8:25 (Office 365 *.mail.protection.outlook.com)
 *    - บน server (เช่น worker1) เข้าถึง IP นี้ได้ตรง ๆ -> ใช้ host เป็น IP จริง
 *    - ถ้าเทสจากเครื่อง local ที่เข้า IP นี้ไม่ได้ ให้เปิด ssh tunnel ก่อน:
 *        ssh -N -f -L 2525:103.197.245.8:25 worker1
 *      แล้วสลับไปใช้ตัว 'localTunnel' (host:'localhost', port:2525)
 * ────────────────────────────────────────────────────────────────────────── */
const SMTP_TARGETS = {
  // ✅ ใช้ตัวนี้บน server จริง (IP ตรง ไม่ผ่าน ssh)
  production: { host: '103.197.245.8', port: 25 },

  // 🔧 ใช้ตอนเทสจาก local — ต้อง ssh -L 2525:103.197.245.8:25 worker1 ก่อน
  localTunnel: { host: 'localhost', port: 2525 },

  // (เผื่อมี relay อื่น ๆ ใส่เพิ่มได้ที่นี่)
  // relay2: { host: '10.x.x.x', port: 25 },
} as const;

const target = SMTP_TARGETS.localTunnel; // เทสจาก local ผ่าน ssh tunnel; ใช้ .production บน server

/* ──────────────────────────────────────────────────────────────────────────
 * 2) NODEMAILER TRANSPORTER
 *    relay นี้ไม่ต้อง auth และเป็น plain SMTP (ไม่ใช้ STARTTLS)
 * ────────────────────────────────────────────────────────────────────────── */
const transporter = nodemailer.createTransport({
  host: target.host,
  port: target.port,
  secure: false, // ไม่ใช่ implicit TLS (465)
  ignoreTLS: true, // ส่งแบบ plain เลี่ยง STARTTLS (cert เป็นชื่อ outlook ไม่ตรง host)
  name: 'osd.co.th', // ชื่อ EHLO/HELO
  connectionTimeout: 10000, // กันค้างนานถ้าต่อ relay ไม่ได้
  greetingTimeout: 10000, // ถ้าไม่ได้ 220 ใน 10s ให้ fail เลย (ไม่รอ 30s)
  // ไม่มี auth key -> relay นี้ไม่ต้อง login
});

/* ──────────────────────────────────────────────────────────────────────────
 * 3) MOCKUP DATA สำหรับทดสอบ
 *    ⚠️ relay เป็น direct-send: รับเฉพาะปลายทาง @osd.co.th
 *       ส่ง gmail/ภายนอก จะโดน 550 Access denied
 *    from ต้องเป็นโดเมน osd.co.th
 * ────────────────────────────────────────────────────────────────────────── */
const mockMail: MailData = {
  from: '"OSD Support" <osdsupport@osd.co.th>',
  to: 'taksapongk@osd.co.th',
  cc: undefined, // ใส่หลายอันได้: 'a@osd.co.th, b@osd.co.th'
  bcc: undefined,
  subject: 'Test send email',
  html: '<p>Test send email from reusable module 🚀</p>',
};

/* ──────────────────────────────────────────────────────────────────────────
 * 4) FUNCTION ส่ง email
 * ────────────────────────────────────────────────────────────────────────── */
type MailData = {
  from: string;
  to: string;
  cc?: string;
  bcc?: string;
  subject: string;
  html: string;
};

/**
 * รูปร่างของ error ที่ nodemailer แนบ SMTP reply กลับมา (ไม่มี type สำเร็จรูป export มาให้)
 */
type SmtpError = {
  message?: string;
  responseCode?: number;
  response?: string;
};

/**
 * ส่งอีเมลผ่าน transporter ที่ตั้งไว้
 * @param data from/to/cc/bcc/subject/html
 * @returns ผลการส่ง (success + messageId หรือ error)
 */
export async function sendMail(data: MailData) {
  try {
    const info = await transporter.sendMail(data);
    console.log('✅ Message sent:', info.messageId, '| accepted:', info.accepted);
    return { success: true, messageId: info.messageId };
  } catch (err: unknown) {
    // narrow เป็น shape ที่เราอ่านจริง — nodemailer ไม่ได้ export type ของ SMTP error
    const e = err as SmtpError;
    console.error('❌ Send failed:', e.message ?? String(err));
    // response/responseCode คือ SMTP reply ตัวเต็ม (เช่น 451 ... ATTR5) ช่วยวิเคราะห์ root cause
    if (e.response) console.error('   SMTP reply:', e.responseCode, e.response);
    return { success: false, error: e.message ?? String(err) };
  }
}

// ── ทดสอบส่ง (รัน: npx ts-node send-mail.ts) ──
void sendMail(mockMail);
