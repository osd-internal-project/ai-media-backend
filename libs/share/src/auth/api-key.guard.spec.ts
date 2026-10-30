import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiKeyGuard, generateApiKey } from './api-key.guard';

describe('ApiKeyGuard', () => {
  const { key, keyHash } = generateApiKey();
  const active = { id: 'k1', keyHash, scopes: ['webhook'], revokedAt: null };
  let update: jest.Mock;
  let guard: ApiKeyGuard;

  const contextWith = (headers: Record<string, string>, scopes: string[] = ['webhook']) => {
    const request: Record<string, unknown> = { headers };
    jest.spyOn(Reflector.prototype, 'getAllAndOverride').mockReturnValue(scopes);
    return {
      request,
      context: {
        getHandler: () => null,
        getClass: () => null,
        switchToHttp: () => ({ getRequest: () => request }),
      } as never,
    };
  };

  beforeEach(() => {
    update = jest.fn();
    guard = new ApiKeyGuard(new Reflector(), {
      // ค้นด้วย hash + revokedAt: null เหมือน DB จริง
      findOne: jest.fn(async ({ where }) =>
        where.keyHash === active.keyHash && where.revokedAt === null && !active.revokedAt
          ? active
          : null,
      ),
      update,
    } as never);
  });

  it('rejects a request without x-api-key', async () => {
    await expect(guard.canActivate(contextWith({}).context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects an unknown key', async () => {
    await expect(
      guard.canActivate(contextWith({ 'x-api-key': 'aick_wrong' }).context),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a key without the scope the route needs', async () => {
    await expect(
      guard.canActivate(contextWith({ 'x-api-key': key }, ['original']).context),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('accepts a valid key and records when it was used', async () => {
    const { context, request } = contextWith({ 'x-api-key': key });
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.apiKeyId).toBe('k1');
    expect(update).toHaveBeenCalledWith({
      where: { id: 'k1' },
      data: { lastUsedAt: expect.any(Date) },
    });
  });

  it('never stores the key itself', () => {
    expect(keyHash).not.toContain(key);
    expect(keyHash).toMatch(/^[0-9a-f]{64}$/);
  });
});
