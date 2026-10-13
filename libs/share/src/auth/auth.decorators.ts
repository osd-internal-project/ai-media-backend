import {
  createParamDecorator,
  ExecutionContext,
  SetMetadata,
} from '@nestjs/common';

export const IS_PUBLIC_KEY = 'auth:isPublic';

/** route ที่ไม่ต้องมี token (webhook, callback, หน้า public) — ต้องมีการป้องกันของตัวเองถ้าเขียนข้อมูล */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/** user ที่ได้จาก Keycloak token (`sub` = `users.token`) */
export interface AuthUser {
  userId: string;
  token: string;
  role: string | null;
}

/** `req.authUser` ที่ KeycloakAuthGuard ใส่ไว้ — undefined เมื่อ AUTH_MODE=off หรือ report แล้วไม่มี token */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthUser | undefined =>
    context.switchToHttp().getRequest().authUser,
);
