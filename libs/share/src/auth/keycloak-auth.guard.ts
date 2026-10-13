import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { AuthUser, IS_PUBLIC_KEY } from './auth.decorators';
import { authMode, bearerToken, KeycloakAuthService } from './keycloak-auth.service';
import { AuthTokenError } from './keycloak-jwt.verifier';

const SUPER_ADMIN = 'SUPER_ADMIN';

type AuthedRequest = Request & { authUser?: AuthUser };

/**
 * ตรวจ Keycloak token ทุก route (APP_GUARD) ยกเว้น `@Public()` และตรวจว่า `userId` ที่ client ส่งมา
 * เป็นของเจ้าของ token — endpoint เดิมยังอ่าน userId จาก query/body ได้โดยไม่ต้องแก้
 * หมายเหตุ: guard ทำงานก่อน multer → body ของ multipart ยังว่าง ตรวจได้แค่ query/params/JSON body
 */
@Injectable()
export class KeycloakAuthGuard implements CanActivate {
  private readonly logger = new Logger(KeycloakAuthGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly auth: KeycloakAuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;
    const mode = authMode();
    if (mode === 'off') return true;
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AuthedRequest>();
    const token = bearerToken(request.headers.authorization);
    if (!token) return this.reject(mode, request, 401, 'missing bearer token');

    let user: AuthUser;
    try {
      user = await this.auth.authenticate(token);
    } catch (error) {
      if (!(error instanceof AuthTokenError)) throw error;
      return this.reject(mode, request, 401, error.message);
    }
    request.authUser = user;

    const claimed = claimedUserIds(request);
    const mismatch = claimed.find(
      (id) => id !== user.userId && id !== user.token,
    );
    if (mismatch && user.role !== SUPER_ADMIN) {
      return this.reject(
        mode,
        request,
        403,
        `userId ${mismatch} does not belong to token user ${user.userId}`,
      );
    }
    return true;
  }

  private reject(
    mode: 'report' | 'enforce',
    request: Request,
    status: 401 | 403,
    reason: string,
  ): boolean {
    // ไม่ log token — แค่ route กับเหตุผล
    const where = `${request.method} ${request.originalUrl?.split('?')[0]}`;
    if (mode === 'report') {
      this.logger.warn(`[auth:report] would ${status} ${where} — ${reason}`);
      return true;
    }
    this.logger.warn(`[auth] ${status} ${where} — ${reason}`);
    throw status === 401
      ? new UnauthorizedException(reason)
      : new ForbiddenException(reason);
  }
}

/** userId ที่ client อ้างใน query / params / JSON body */
function claimedUserIds(request: Request): string[] {
  const sources: unknown[] = [
    request.query?.userId,
    request.params?.userId,
    (request.body as Record<string, unknown> | undefined)?.userId,
  ];
  return sources.filter(
    (value): value is string => typeof value === 'string' && value !== '',
  );
}
