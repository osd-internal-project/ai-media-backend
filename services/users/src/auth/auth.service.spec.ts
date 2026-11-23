import { UnauthorizedException } from '@nestjs/common';
import { KeycloakJwtVerifier, UsersRepository } from '@ai-media/share';
import { KeycloakService } from '../keycloak/keycloak.service';
import { AuthService } from './auth.service';

// keycloak.service pulls in config and HTTP clients this test never reaches.
jest.mock('../keycloak/keycloak.service', () => ({ KeycloakService: class {} }));

describe('AuthService.checkUser', () => {
  const findOne = jest.fn();
  const verify = jest.fn();
  const service = new AuthService(
    {} as KeycloakService,
    { findOne } as unknown as UsersRepository,
    { verify } as unknown as KeycloakJwtVerifier,
  );
  const active = { userId: 'u1', email: 'a@x.com', status: 'active' };

  beforeEach(() => {
    jest.resetAllMocks();
    verify.mockResolvedValue({ sub: 'kc-1', email: 'a@x.com' });
  });

  it('matches by the verified sub, ignoring the email in the body', async () => {
    findOne.mockResolvedValue(active);
    expect(await service.checkUser({ accessToken: 't', email: 'other@x.com' })).toBe(active);
    expect(findOne).toHaveBeenCalledTimes(1);
    expect(findOne.mock.calls[0][0].where).toEqual({ token: 'kc-1' });
  });

  it('falls back to the token email when no user has that sub', async () => {
    findOne.mockResolvedValueOnce(null).mockResolvedValueOnce(active);
    expect(await service.checkUser({ accessToken: 't' })).toBe(active);
    expect(findOne.mock.calls[1][0].where).toEqual({ email: 'a@x.com' });
  });

  it('flags a user whose status cannot sign in', async () => {
    findOne.mockResolvedValue({ ...active, status: 'banned' });
    expect(await service.checkUser({ accessToken: 't' })).toEqual(
      expect.objectContaining({ userId: 'u1', blocked: true }),
    );
  });

  it('rejects a token that fails verification without touching the database', async () => {
    verify.mockRejectedValue(new Error('bad signature'));
    await expect(service.checkUser({ accessToken: 't' })).rejects.toBeInstanceOf(UnauthorizedException);
    expect(findOne).not.toHaveBeenCalled();
  });

  it('still accepts the email-only form of older frontends', async () => {
    findOne.mockResolvedValue(active);
    expect(await service.checkUser({ email: 'a@x.com' })).toBe(active);
    expect(verify).not.toHaveBeenCalled();
  });
});
