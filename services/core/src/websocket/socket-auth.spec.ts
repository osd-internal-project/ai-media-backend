import { ForbiddenException, Logger } from '@nestjs/common';
import { AuthTokenError } from '@ai-media/share';
import { authenticateSocket } from './socket-auth';
import { WebsocketController } from './websocket.controller';

const logger = { warn: jest.fn() } as unknown as Logger;
const socket = (token?: string) =>
  ({
    id: 's1',
    handshake: { auth: token ? { token } : {} },
    data: {} as Record<string, unknown>,
    disconnect: jest.fn(),
  } as never);

describe('authenticateSocket', () => {
  const user = { userId: 'u-1', token: 'sub', role: 'USER' };
  const auth = (ok: boolean) =>
    ({
      authenticate: jest.fn(async () => {
        if (!ok) throw new AuthTokenError('bad signature');
        return user;
      }),
    } as never);

  afterEach(() => {
    delete process.env.AUTH_MODE;
  });

  it('off: connects without a token', async () => {
    const client = socket();
    await expect(authenticateSocket(client, auth(false), logger)).resolves.toBe(true);
  });

  it('enforce: valid token stores the user on the socket', async () => {
    process.env.AUTH_MODE = 'enforce';
    const client = socket('jwt') as { data: Record<string, unknown> };
    await expect(authenticateSocket(client as never, auth(true), logger)).resolves.toBe(true);
    expect(client.data.authUser).toEqual(user);
  });

  it('enforce: missing / bad token disconnects', async () => {
    process.env.AUTH_MODE = 'enforce';
    for (const client of [socket(), socket('jwt')]) {
      await expect(authenticateSocket(client, auth(false), logger)).resolves.toBe(false);
      expect((client as { disconnect: jest.Mock }).disconnect).toHaveBeenCalledWith(true);
    }
  });

  it('report: bad token is logged but stays connected', async () => {
    process.env.AUTH_MODE = 'report';
    const client = socket('jwt') as { disconnect: jest.Mock };
    await expect(authenticateSocket(client as never, auth(false), logger)).resolves.toBe(true);
    expect(client.disconnect).not.toHaveBeenCalled();
  });
});

describe('WebsocketController internal key', () => {
  const redis = { publish: jest.fn() };
  const controller = new WebsocketController(redis as never);

  afterEach(() => {
    delete process.env.INTERNAL_API_KEY;
    delete process.env.AUTH_MODE;
    redis.publish.mockClear();
  });

  it('accepts the configured key', async () => {
    process.env.INTERNAL_API_KEY = 'k-123';
    await controller.notifyInvitation({ email: 'a@b.c' }, 'k-123');
    expect(redis.publish).toHaveBeenCalled();
  });

  it('rejects a wrong key', async () => {
    process.env.INTERNAL_API_KEY = 'k-123';
    await expect(
      controller.notifyInvitation({ email: 'a@b.c' }, 'nope'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(redis.publish).not.toHaveBeenCalled();
  });

  it('no key configured: allowed during rollout, refused under enforce', async () => {
    await controller.notifyInvitation({ email: 'a@b.c' });
    process.env.AUTH_MODE = 'enforce';
    await expect(
      controller.notifyInvitation({ email: 'a@b.c' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
