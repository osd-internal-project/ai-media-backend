import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { AuthUser } from './auth.decorators';
import { authMode } from './keycloak-auth.service';

export const SYSTEM_ADMIN_ROLES = ['SUPER_ADMIN', 'SYSTEM_ADMIN'];

/** role ในระบบมีค่าที่ติดช่องว่างท้ายอยู่จริง จึง trim ก่อนเทียบ */
export function isSystemAdmin(user: AuthUser | undefined): boolean {
  const role = user?.role?.trim();
  return !!role && SYSTEM_ADMIN_ROLES.includes(role);
}

/**
 * เฉพาะ system admin — ใช้ต่อจาก KeycloakAuthGuard (APP_GUARD) ที่ใส่ `req.authUser` ไว้
 * AUTH_MODE=off ไม่มีตัวตนให้ตรวจ จึงปล่อยผ่านเหมือน guard หลัก; report / enforce ปฏิเสธจริง
 */
@Injectable()
export class SystemAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    if (authMode() === 'off') return true;
    const request = context
      .switchToHttp()
      .getRequest<{ authUser?: AuthUser }>();
    if (!isSystemAdmin(request.authUser)) {
      throw new ForbiddenException('Only a system administrator can do this');
    }
    return true;
  }
}
