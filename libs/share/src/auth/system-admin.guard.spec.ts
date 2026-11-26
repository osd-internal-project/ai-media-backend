import { ForbiddenException } from '@nestjs/common';
import { AuthUser } from './auth.decorators';
import { SystemAdminGuard } from './system-admin.guard';

describe('SystemAdminGuard', () => {
  const guard = new SystemAdminGuard();
  const original = process.env.AUTH_MODE;

  const contextWith = (authUser?: AuthUser) =>
    ({
      switchToHttp: () => ({ getRequest: () => ({ authUser }) }),
    }) as never;
  const user = (role: string | null): AuthUser => ({ userId: 'u1', token: 't1', role });

  afterEach(() => {
    process.env.AUTH_MODE = original;
  });

  it.each(['report', 'enforce'])('lets a system admin through in %s mode', (mode) => {
    process.env.AUTH_MODE = mode;
    expect(guard.canActivate(contextWith(user('SUPER_ADMIN')))).toBe(true);
    expect(guard.canActivate(contextWith(user('SYSTEM_ADMIN ')))).toBe(true);
  });

  it.each(['report', 'enforce'])('rejects a plain user or no user in %s mode', (mode) => {
    process.env.AUTH_MODE = mode;
    expect(() => guard.canActivate(contextWith(user('USER')))).toThrow(ForbiddenException);
    expect(() => guard.canActivate(contextWith(user(null)))).toThrow(ForbiddenException);
    expect(() => guard.canActivate(contextWith())).toThrow(ForbiddenException);
  });

  it('passes everything when AUTH_MODE is off, like the main guard', () => {
    process.env.AUTH_MODE = 'off';
    expect(guard.canActivate(contextWith())).toBe(true);
  });
});
