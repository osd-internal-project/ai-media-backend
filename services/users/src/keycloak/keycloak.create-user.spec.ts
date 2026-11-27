import axios from 'axios';
import { UsersRepository } from '@ai-media/share';
import { KeycloakService } from './keycloak.service';
import { UsersService } from 'src/users/users.service';

jest.mock('axios');
jest.mock('src/configs', () => ({
  __esModule: true,
  default: () => ({
    env: 'test',
    keycloak: { url: 'https://kc', realm: 'eportal', clientId: 'c', clientSecret: 's' },
  }),
}));

const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('KeycloakService.createUser emailVerified', () => {
  const service = new KeycloakService(
    {} as UsersRepository,
    {} as UsersService,
  );
  const dto = { username: 'a', password: 'p', email: 'a@x.com', fullname: 'A B' };

  beforeEach(() => {
    jest.resetAllMocks();
    mockedAxios.post.mockImplementation(async (url: string) =>
      url.endsWith('/token') ? { data: { access_token: 't' } } : { data: {} },
    );
    mockedAxios.get.mockResolvedValue({ data: [{ id: 'kc-1' }] });
  });

  const sentUser = () =>
    mockedAxios.post.mock.calls.find(([url]) => url.endsWith('/users'))?.[1];

  it('marks the email verified when the caller proved it', async () => {
    expect(await service.createUser({ ...dto, emailVerified: true })).toBe('kc-1');
    expect(sentUser()).toEqual(expect.objectContaining({ emailVerified: true }));
  });

  it('leaves the email unverified by default', async () => {
    await service.createUser(dto);
    expect(sentUser()).toEqual(expect.objectContaining({ emailVerified: false }));
  });
});
