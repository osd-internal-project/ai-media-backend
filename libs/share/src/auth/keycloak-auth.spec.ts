import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { createSign, generateKeyPairSync, KeyObject } from 'crypto';
import { AuthTokenError, KeycloakJwtVerifier } from './keycloak-jwt.verifier';
import { KeycloakAuthService } from './keycloak-auth.service';
import { KeycloakAuthGuard } from './keycloak-auth.guard';

const ISSUER_BASE = 'https://id.example';
const REALM = 'eportal';
const ISSUER = `${ISSUER_BASE}/realms/${REALM}`;

const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
});
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'k1', use: 'sig' };

const b64 = (value: object) =>
  Buffer.from(JSON.stringify(value)).toString('base64url');

const sign = (
  claims: Record<string, unknown>,
  header: Record<string, unknown> = { alg: 'RS256', kid: 'k1' },
  key: KeyObject = privateKey,
) => {
  const data = `${b64(header)}.${b64(claims)}`;
  const signature = createSign('RSA-SHA256').update(data).sign(key);
  return `${data}.${signature.toString('base64url')}`;
};

const now = () => Math.floor(Date.now() / 1000);
const goodClaims = (extra: Record<string, unknown> = {}) => ({
  sub: 'kc-sub-1',
  iss: ISSUER,
  azp: 'ai-cave-prod',
  exp: now() + 300,
  ...extra,
});

/** verifier ที่ไม่ยิง network — คืน JWKS จาก key ใน test */
class TestVerifier extends KeycloakJwtVerifier {
  fetches = 0;
  jwks: object[] = [jwk];
  protected async fetchJwks() {
    this.fetches += 1;
    return { keys: this.jwks as never };
  }
}

const env = { ...process.env };
beforeEach(() => {
  process.env.KEYCLOAK_URL = ISSUER_BASE;
  process.env.KEYCLOAK_REALM = REALM;
  process.env.KEYCLOAK_ALLOWED_CLIENTS = 'ai-cave-prod, ai-cave-sit';
});
afterAll(() => {
  process.env = env;
});

describe('KeycloakJwtVerifier', () => {
  it('accepts a valid RS256 token', async () => {
    const claims = await new TestVerifier().verify(sign(goodClaims()));
    expect(claims.sub).toBe('kc-sub-1');
  });

  it.each([
    ['a bad signature', () => sign(goodClaims()).replace(/.{4}$/, 'AAAA')],
    ['an expired token', () => sign(goodClaims({ exp: now() - 120 }))],
    ['a foreign issuer', () => sign(goodClaims({ iss: 'https://evil/realms/x' }))],
    ['a client not in the allowlist', () => sign(goodClaims({ azp: 'other' }))],
    ['alg none', () => `${b64({ alg: 'none', kid: 'k1' })}.${b64(goodClaims())}.`],
    ['HS256', () => sign(goodClaims(), { alg: 'HS256', kid: 'k1' })],
    ['an unknown kid', () => sign(goodClaims(), { alg: 'RS256', kid: 'nope' })],
    ['garbage', () => 'not-a-jwt'],
  ])('rejects %s', async (_label, build) => {
    await expect(new TestVerifier().verify(build())).rejects.toBeInstanceOf(
      AuthTokenError,
    );
  });

  it('rejects everything when no client allowlist is configured', async () => {
    process.env.KEYCLOAK_ALLOWED_CLIENTS = '';
    await expect(
      new TestVerifier().verify(sign(goodClaims())),
    ).rejects.toThrow('KEYCLOAK_ALLOWED_CLIENTS is not set');
  });

  it('caches JWKS and refetches for a rotated kid at most once a minute', async () => {
    const verifier = new TestVerifier();
    await verifier.verify(sign(goodClaims()));
    await verifier.verify(sign(goodClaims()));
    expect(verifier.fetches).toBe(1);
    await expect(
      verifier.verify(sign(goodClaims(), { alg: 'RS256', kid: 'k2' })),
    ).rejects.toBeInstanceOf(AuthTokenError);
    expect(verifier.fetches).toBe(1);
  });
});

describe('KeycloakAuthGuard', () => {
  const user = { userId: 'u-1', token: 'kc-sub-1', role: 'USER', status: 'active' };
  let usersRepo: { findOne: jest.Mock };
  let guard: KeycloakAuthGuard;
  let isPublic: boolean;

  const contextFor = (request: Record<string, unknown>) => {
    const req = {
      method: 'GET',
      originalUrl: '/api/x',
      headers: {},
      query: {},
      params: {},
      body: {},
      ...request,
    };
    return {
      getType: () => 'http',
      getHandler: () => undefined,
      getClass: () => undefined,
      switchToHttp: () => ({ getRequest: () => req }),
    } as unknown as ExecutionContext;
  };

  const bearer = (token = sign(goodClaims())) => ({
    headers: { authorization: `Bearer ${token}` },
  });

  beforeEach(() => {
    isPublic = false;
    usersRepo = { findOne: jest.fn().mockResolvedValue(user) };
    const reflector = {
      getAllAndOverride: jest.fn(() => isPublic),
    } as unknown as Reflector;
    guard = new KeycloakAuthGuard(
      reflector,
      new KeycloakAuthService(new TestVerifier(), usersRepo as never),
    );
  });

  it('off: lets everything through without checking', async () => {
    process.env.AUTH_MODE = 'off';
    await expect(guard.canActivate(contextFor({}))).resolves.toBe(true);
    expect(usersRepo.findOne).not.toHaveBeenCalled();
  });

  it('report: missing token is logged but allowed', async () => {
    process.env.AUTH_MODE = 'report';
    await expect(guard.canActivate(contextFor({}))).resolves.toBe(true);
  });

  it('enforce: missing token → 401', async () => {
    process.env.AUTH_MODE = 'enforce';
    await expect(guard.canActivate(contextFor({}))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('enforce: @Public routes need no token', async () => {
    process.env.AUTH_MODE = 'enforce';
    isPublic = true;
    await expect(guard.canActivate(contextFor({}))).resolves.toBe(true);
  });

  it('enforce: valid token sets req.authUser', async () => {
    process.env.AUTH_MODE = 'enforce';
    const request = { ...bearer(), query: { userId: 'u-1' } };
    const ctx = contextFor(request);
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(ctx.switchToHttp().getRequest().authUser).toEqual({
      userId: 'u-1',
      token: 'kc-sub-1',
      role: 'USER',
    });
    expect(usersRepo.findOne.mock.calls[0][0].where).toEqual({
      token: 'kc-sub-1',
    });
  });

  it('enforce: userId may be either users.userId or users.token', async () => {
    process.env.AUTH_MODE = 'enforce';
    await expect(
      guard.canActivate(contextFor({ ...bearer(), body: { userId: 'kc-sub-1' } })),
    ).resolves.toBe(true);
  });

  it('enforce: userId of someone else → 403', async () => {
    process.env.AUTH_MODE = 'enforce';
    await expect(
      guard.canActivate(contextFor({ ...bearer(), query: { userId: 'u-2' } })),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('enforce: SUPER_ADMIN may act for another userId', async () => {
    process.env.AUTH_MODE = 'enforce';
    usersRepo.findOne.mockResolvedValue({ ...user, role: 'SUPER_ADMIN' });
    await expect(
      guard.canActivate(contextFor({ ...bearer(), query: { userId: 'u-2' } })),
    ).resolves.toBe(true);
  });

  it('enforce: token of a deleted user → 401', async () => {
    process.env.AUTH_MODE = 'enforce';
    usersRepo.findOne.mockResolvedValue({ ...user, status: 'deleted' });
    await expect(guard.canActivate(contextFor(bearer()))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('report: userId mismatch is logged but allowed', async () => {
    process.env.AUTH_MODE = 'report';
    await expect(
      guard.canActivate(contextFor({ ...bearer(), query: { userId: 'u-2' } })),
    ).resolves.toBe(true);
  });
});
