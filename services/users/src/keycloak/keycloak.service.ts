import { UsersRepository } from '@ai-media/share';
import {
  Injectable,
  Logger,
  InternalServerErrorException,
  BadRequestException,
  ConflictException,
  HttpException,
  ForbiddenException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import axios from 'axios';
import configs from 'src/configs';
import * as https from 'https';
import * as jwt from "jsonwebtoken";
import { UsersService } from 'src/users/users.service';

/** Identity providers brokered through Keycloak. */
export const IDP_HINTS = ['google', 'microsoft'] as const;

export type IdpHint = (typeof IDP_HINTS)[number];

/**
 * Narrows an arbitrary route segment to a supported identity provider.
 *
 * @param value Raw `:idp` path parameter.
 * @returns True when the value names a provider we broker.
 */
export const isIdpHint = (value: unknown): value is IdpHint =>
  typeof value === 'string' && (IDP_HINTS as readonly string[]).includes(value);

@Injectable()
export class KeycloakService {
  constructor(
    private readonly usersRepo: UsersRepository,
    @Inject(forwardRef(() => UsersService)) private readonly usersService: UsersService,
  ) { }
  private async getAdminToken(): Promise<string> {
    const config = configs().keycloak;
    const params = new URLSearchParams();
    if (!config.clientSecret) {
      Logger.error('Not found client secret');
      throw new InternalServerErrorException('Failed to get create user');
    } else {
      params.append('client_id', config.clientId);
      params.append('client_secret', config.clientSecret);
      params.append('grant_type', 'client_credentials');
    }
    // Logger.debug(`params ${params}`);
    const httpsAgent = new https.Agent({
      rejectUnauthorized: configs().env === 'local' || configs().env === 'development' ? false : true,
    });
    const { data } = await axios.post(
      `${config.url}/realms/${config.realm}/protocol/openid-connect/token`,
      params,
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        httpsAgent,
      },
    );
    // Logger.debug(data);
    return data.access_token;
  }

  async validateToken(token: string): Promise<boolean> {
    try {
      const config = configs().keycloak;
      const params = new URLSearchParams();
      params.append('client_id', config.clientId);
      params.append('client_secret', config.clientSecret);
      params.append('token', token);
      const httpsAgent = new https.Agent({
        rejectUnauthorized: configs().env === 'local' || configs().env === 'development' ? false : true,
      });
      const { data } = await axios.post(
        `${config.url}/realms/${config.realm}/protocol/openid-connect/token/introspect`,
        params,
        {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          httpsAgent,
        },
      );

      const isActive = data.active === true;

      // if (isActive) {
      //   Logger.log('Token validation successful', {
      //     active: data.active,
      //     exp: data.exp ? new Date(data.exp * 1000).toISOString() : 'N/A',
      //     iat: data.iat ? new Date(data.iat * 1000).toISOString() : 'N/A',
      //     session_state: data.session_state || 'N/A',
      //   });
      // } else {
      //   Logger.warn(
      //     'Token validation failed - SSO session expired or invalid',
      //     {
      //       active: data.active,
      //       exp: data.exp ? new Date(data.exp * 1000).toISOString() : 'N/A',
      //     },
      //   );
      // }

      return isActive;
    } catch (error) {
      Logger.error('Error validating token with Keycloak', error.message);
      return false;
    }
  }

  async createUser(userDto: any): Promise<string> {
    try {
      const config = configs().keycloak;
      const token = await this.getAdminToken();
      if (!token) {
        Logger.error('Failed to get admin token');
        throw new InternalServerErrorException('Failed to create user');
      }
      const newUser = {
        attributes: {
          attribute_key: 'create_aicave_user',
        },
        credentials: [
          {
            temporary: false,
            type: 'password',
            value: userDto.password,
          },
        ],
        username: userDto.username,
        firstName: userDto.fullname?.trim().split(' ')[0] || userDto.username,
        lastName:
          userDto.fullname?.trim().split(' ').slice(1).join(' ') ||
          '-',
        email: userDto.email || '',
        emailVerified: false,
        enabled: true,
      };
      // Create User
      await axios.post(
        `${config.url}/admin/realms/${config.realm}/users`,
        newUser,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          httpsAgent: new https.Agent({
            rejectUnauthorized: configs().env === 'local' || configs().env === 'development' ? false : true,
          }),
        },
      );

      // Get User ID
      const { data: users } = await axios.get(
        `${config.url}/admin/realms/${config.realm}/users?username=${userDto.username}`,
        {
          headers: { Authorization: `Bearer ${token}` },
          httpsAgent: new https.Agent({
            rejectUnauthorized: configs().env === 'local' || configs().env === 'development' ? false : true,
          }),
        },
      );

      if (!users.length) {
        Logger.error('User created but not found in Keycloak');
        throw new InternalServerErrorException('Failed to create user ');
      }
      return users[0].id;
    } catch (error) {
      Logger.error(
        `Error creating user in Keycloak: ${error?.response?.data.error_description || error.message
        }`,
      );

      if (axios.isAxiosError(error) && error.response) {
        const { status, data } = error.response;
        const message =
          data?.errorMessage ||
          data?.error_description ||
          'Failed to create user in Keycloak';

        if (status === 409) {
          throw new ConflictException(message);
        }
        if (status === 400) {
          throw new BadRequestException(message);
        }

        throw new HttpException(message, status);
      }

      throw new InternalServerErrorException('Failed to create user');
    }
  }

  async findUserByUsernameOrEmail(username: string, email: string) {
    const config = configs().keycloak;
    const token = await this.getAdminToken();

    try {
      const [byUsername, byEmail] = await Promise.all([
        axios.get(`${config.url}/admin/realms/${config.realm}/users`, {
          params: { username, exact: true },
          headers: { Authorization: `Bearer ${token}` },
          httpsAgent: new https.Agent({
            rejectUnauthorized: configs().env === 'local' || configs().env === 'development' ? false : true,
          }),
        }),
        axios.get(`${config.url}/admin/realms/${config.realm}/users`, {
          params: { email, exact: true },
          headers: { Authorization: `Bearer ${token}` },
          httpsAgent: new https.Agent({
            rejectUnauthorized: configs().env === 'local' || configs().env === 'development' ? false : true,
          }),
        }),
      ]);

      const users = [...byUsername.data, ...byEmail.data];
      // Deduplicate by ID just in case
      const uniqueUsers = Array.from(
        new Map(users.map((u) => [u.id, u])).values(),
      );
      return uniqueUsers;
    } catch (error) {
      Logger.error(
        `Failed to search users in Keycloak: ${error.message}`,
        error?.response?.data,
      );
      // If the search fails, we might not want to block creation entirely,
      // but if the requirement is strict duplicate checking, we should probably throw (or return empty if we want to fail open, but fail closed is safer for data integrity).
      // For now, let's rethrow as internal server error since we can't verify uniqueness.
      throw new InternalServerErrorException(
        'Failed to check user existence in Keycloak',
      );
    }
  }

  async updateUser(userId: string, userDto: any) {
    const config = configs().keycloak;
    const token = await this.getAdminToken();

    const updatePayload: any = {
      ...(userDto.email && { email: userDto.email }),
      ...(userDto.fullname && { firstName: userDto.fullname?.split(' ')[0] }),
      ...(userDto.fullname && {
        lastName: userDto.fullname?.split(' ').slice(1).join(' '),
      }),
      ...(userDto.status && { enabled: userDto.status === 'active' }),
    };

    if (userDto.password) {
      updatePayload.credentials = [
        {
          type: 'password',
          value: userDto.password,
          temporary: false,
        },
      ];
    }

    // Only update fields that are present
    Object.keys(updatePayload).forEach(
      (key) => updatePayload[key] === undefined && delete updatePayload[key],
    );

    await axios.put(
      `${config.url}/admin/realms/${config.realm}/users/${userId}`,
      updatePayload,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        httpsAgent: new https.Agent({
          rejectUnauthorized: configs().env === 'local' || configs().env === 'development' ? false : true,
        }),
      },
    );
  }

  async deleteUser(keycloakUserId: string) {
    const config = configs().keycloak;
    const token = await this.getAdminToken();

    await axios.delete(
      `${config.url}/admin/realms/${config.realm}/users/${keycloakUserId}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        httpsAgent: new https.Agent({
          rejectUnauthorized: configs().env === 'local' || configs().env === 'development' ? false : true,
        }),
      },
    );
  }

  async refresh(refreshToken: string) {
    const config = configs().keycloak;
    const params = new URLSearchParams();
    params.append('client_id', config.clientId);
    params.append('client_secret', config.clientSecret);
    params.append('grant_type', 'refresh_token');
    params.append('refresh_token', refreshToken);

    const response = await axios.post(
      `${config.url}/realms/${config.realm}/protocol/openid-connect/token`,
      params,
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        httpsAgent: new https.Agent({
          rejectUnauthorized: configs().env === 'local' || configs().env === 'development' ? false : true,
        }),
      },
    );

    return response.data;
  }

  async login(loginDto: any): Promise<any> {
    const config = configs().keycloak;
    const params = new URLSearchParams();
    params.append('client_id', config.clientId);
    params.append('client_secret', config.clientSecret);
    params.append('grant_type', 'password');
    params.append('username', loginDto.username);
    params.append('password', loginDto.password);
    params.append('scope', 'openid');

    try {
      const user = await this.usersRepo.findOne({
        where: {
          OR: [
            { username: loginDto.username },
            { email: loginDto.username },
          ],
        },
        select: {
          recentOrganizationId: true,
          username: true,
          email: true,
          status: true,
          userId: true,
          role: true,
        }
      });

      if (!user) {
        throw new ForbiddenException('Not User'); // Message as requested
      }
      const { data } = await axios.post(
        `${config.url}/realms/${config.realm}/protocol/openid-connect/token`,
        params,
        {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          httpsAgent: new https.Agent({
            rejectUnauthorized: configs().env === 'local' || configs().env === 'development' ? false : true,
          }),
        },
      );
      return { ...data, ...user };
    } catch (error) {
      Logger.error(
        `Login failed for user ${loginDto.username}`,
        JSON.stringify({
          message: error.message,
          response: error.response?.data,
          status: error.response?.status,
        }),
      );
      throw new BadRequestException(
        error.response?.data?.error_description || 'Invalid credentials',
      );
    }
  }

  async getPasswordPolicy() {
    const config = configs().keycloak;
    const token = await this.getAdminToken();
    const { data } = await axios.get(
      `${config.url}/admin/realms/${config.realm}`,
      {
        headers: { Authorization: `Bearer ${token}` },
        httpsAgent: new https.Agent({
          rejectUnauthorized: configs().env === 'local' || configs().env === 'development' ? false : true,
        }),
      },
    );
    return data.passwordPolicy;
  }

  async findUserByEmail(email: string) {
    const config = configs().keycloak;
    const token = await this.getAdminToken();
    const { data } = await axios.get(
      `${config.url}/admin/realms/${config.realm}/users`,
      {
        params: { email, exact: true },
        headers: { Authorization: `Bearer ${token}` },
        httpsAgent: new https.Agent({
          rejectUnauthorized: configs().env === 'local' || configs().env === 'development' ? false : true,
        }),
      },
    );
    return data;
  }

  /**
   * Builds the Keycloak authorization URL for a brokered identity provider.
   *
   * Only the `kc_idp_hint` parameter distinguishes providers — everything else (client,
   * realm, redirect URI) is shared, which is why the callback needs no provider argument.
   *
   * @param idp Which identity provider to route the user to.
   * @returns The full authorization URL to redirect the browser to.
   */
  async getIdpLoginUrl(idp: IdpHint) {
    const config = configs().keycloak;
    const rootUrl = `${config.url}/realms/${config.realm}/protocol/openid-connect/auth`;
    const params = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: `${config.redirectUri}`,
      response_type: 'code',
      kc_idp_hint: config.idpAliases[idp],
      scope: 'openid email profile',
    });
    return `${rootUrl}?${params.toString()}`;
  }

  /**
   * @deprecated Use {@link getIdpLoginUrl}. Retained so already-deployed frontends keep
   *   working during rollout.
   */
  async getGoogleLoginUrl() {
    return this.getIdpLoginUrl('google');
  }

  /**
   * Exchanges an authorization code for tokens and provisions the local user.
   *
   * Provider-agnostic by construction: the code exchange, the id_token decode and the
   * email-based lookup are identical for every brokered provider. Keycloak redirects back
   * to a single registered URI carrying only `?code`, so the frontend cannot tell us which
   * provider was used — and does not need to.
   *
   * @param code The authorization code from the Keycloak redirect.
   * @returns Tokens plus the local user's identifiers, or the raw tokens if no matching
   *   Keycloak user could be found.
   */
  /**
   * Local user for the Keycloak account with this email, created with a personal org on first sign-in.
   * @param sub when given, the Keycloak user id must match it.
   * @returns null when Keycloak has no matching user.
   */
  async ensureLocalUser(email: string | undefined, sub?: string) {
    // ไม่มี email → Keycloak admin search คืนทุก user และ users[0] เป็นคนอื่น
    if (!email) {
      throw new BadRequestException('Identity provider returned no email');
    }
    const users: { id: string; username: string; firstName?: string; lastName?: string }[] =
      await this.findUserByEmail(email);
    const user = users?.find((u) => !sub || u.id === sub);
    if (!user) return null;

    const fullname = [user.firstName, user.lastName].filter(Boolean).join(" ").trim() || user.username;
    return this.usersService.createFirstUser({
      email,
      username: user.username,
      fullname,
      phoneNumber: '',
      tokenKeycloak: user.id,
      firstName: user.firstName,
    });
  }

  async idpCallback(code: string) {
    const config = configs().keycloak;
    const params = new URLSearchParams();
    params.append("client_id", config.clientId);
    params.append("client_secret", config.clientSecret);
    params.append("grant_type", "authorization_code");
    params.append("code", code);
    params.append("redirect_uri", config.redirectUri);

    const tokenRes = await axios.post(
      `${config.url}/realms/${config.realm}/protocol/openid-connect/token`,
      params,
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        httpsAgent: new https.Agent({
          rejectUnauthorized: configs().env === 'local' || configs().env === 'development' ? false : true,
        }),
      }
    );

    const tokens = tokenRes.data;
    const decoded = jwt.decode(tokens.id_token) as { email?: string } | null;
    const userDetail = await this.ensureLocalUser(decoded?.email);

    if (userDetail) {
      return {
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_in: tokens.expires_in,
        id: userDetail.userId,
        id_token: tokens.id_token,
        recentOrganizationId: userDetail?.recentOrganizationId,
        userId: userDetail?.userId,
        role: userDetail?.role,
      };
    }

    return tokens;
  }

  /**
   * @deprecated Use {@link idpCallback}. Retained so already-deployed frontends keep
   *   working during rollout.
   */
  async googleCallback(code: string) {
    return this.idpCallback(code);
  }
}
