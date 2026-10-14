import { Injectable } from '@nestjs/common';
import { UsersRepository } from '../repositories';
import { AuthUser } from './auth.decorators';
import { AuthTokenError, KeycloakJwtVerifier } from './keycloak-jwt.verifier';

export type AuthMode = 'off' | 'report' | 'enforce';

/** `AUTH_MODE` — off: ไม่ตรวจ · report: ตรวจแล้ว log แต่ไม่ block · enforce: block จริง */
export function authMode(): AuthMode {
  const mode = (process.env.AUTH_MODE ?? 'off').trim().toLowerCase();
  return mode === 'report' || mode === 'enforce' ? mode : 'off';
}

const USER_CACHE_TTL_MS = 5 * 60 * 1000;
const USER_CACHE_MAX = 10_000;
const BLOCKED_STATUSES = ['deleted', 'banned', 'inactive'];

/** token → user ของระบบ (`sub` = `users.token`) — ใช้ร่วมกันระหว่าง HTTP guard และ socket */
@Injectable()
export class KeycloakAuthService {
  private readonly cache = new Map<string, { user: AuthUser; at: number }>();

  constructor(
    private readonly verifier: KeycloakJwtVerifier,
    private readonly usersRepo: UsersRepository,
  ) {}

  /** @throws AuthTokenError เมื่อ token ไม่ถูกต้อง หรือไม่มี user ที่ใช้งานได้ของ sub นี้ */
  async authenticate(token: string): Promise<AuthUser> {
    const claims = await this.verifier.verify(token);
    return this.userFor(claims.sub);
  }

  private async userFor(sub: string): Promise<AuthUser> {
    const hit = this.cache.get(sub);
    if (hit && Date.now() - hit.at < USER_CACHE_TTL_MS) return hit.user;

    const row = await this.usersRepo.findOne({
      where: { token: sub },
      select: { userId: true, token: true, role: true, status: true },
    });
    if (!row || BLOCKED_STATUSES.includes(row.status)) {
      throw new AuthTokenError(`no active user for sub ${sub}`);
    }
    const user: AuthUser = { userId: row.userId, token: sub, role: row.role };
    if (this.cache.size >= USER_CACHE_MAX) this.cache.clear();
    this.cache.set(sub, { user, at: Date.now() });
    return user;
  }
}

/** ดึง token จาก `Authorization: Bearer …` */
export function bearerToken(header: string | string[] | undefined): string | null {
  const value = Array.isArray(header) ? header[0] : header;
  const [type, token] = value?.split(' ') ?? [];
  return type === 'Bearer' && token ? token : null;
}
