import { Logger } from '@nestjs/common';
import { Socket } from 'socket.io';
import { authMode, KeycloakAuthService } from '@ai-media/share';

/**
 * ตรวจ token ที่ client ส่งมาตอน connect (`io(url, { auth: { token } })`) ตาม AUTH_MODE
 * ผ่าน → `client.data.authUser` · enforce + ไม่ผ่าน → disconnect · report → log แล้วให้ต่อได้
 * @returns false เมื่อ socket ถูกตัดแล้ว (ผู้เรียกต้องหยุดทำงานต่อ)
 */
export async function authenticateSocket(
  client: Socket,
  auth: KeycloakAuthService,
  logger: Logger,
): Promise<boolean> {
  const mode = authMode();
  if (mode === 'off') return true;
  const raw: unknown = client.handshake.auth?.token;
  const token = typeof raw === 'string' && raw ? raw : null;
  try {
    if (!token) throw new Error('missing socket token');
    client.data.authUser = await auth.authenticate(token);
    return true;
  } catch (error) {
    const reason = (error as Error).message;
    if (mode === 'report') {
      logger.warn(`[auth:report] would disconnect socket ${client.id} — ${reason}`);
      return true;
    }
    logger.warn(`[auth] disconnect socket ${client.id} — ${reason}`);
    client.disconnect(true);
    return false;
  }
}
