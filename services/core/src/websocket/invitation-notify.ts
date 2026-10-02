import { createHash } from 'crypto';

/** Redis channel ที่ทุก pod ของ core subscribe เพื่อกระจาย noti คำเชิญ */
export const INVITATION_NOTIFY_CHANNEL = 'notify:invitation';

/** event ที่ส่งให้ client — payload ว่างเสมอ เพราะ socket ยังไม่มี auth */
export const INVITATION_CHANGED_EVENT = 'invitation:changed';

/** ห้องต่อ email — hash เพื่อไม่ให้ email โผล่ใน log/ชื่อห้อง */
export const invitationRoom = (email: string): string =>
  `invitation:${createHash('sha256')
    .update(email.trim().toLowerCase())
    .digest('hex')}`;
