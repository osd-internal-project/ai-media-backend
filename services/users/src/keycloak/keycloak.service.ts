import {
  Injectable,
  Logger,
  InternalServerErrorException,
  BadRequestException,
  ConflictException,
  HttpException,
} from '@nestjs/common';
import axios from 'axios';
import configs from 'src/configs';

@Injectable()
export class KeycloakService {
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
    const { data } = await axios.post(
      `${config.url}/realms/${config.realm}/protocol/openid-connect/token`,
      params,
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
    );
    // Logger.debug(data);
    return data.access_token;
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
          'NOLASTNAME',
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
        },
      );

      // Get User ID
      const { data: users } = await axios.get(
        `${config.url}/admin/realms/${config.realm}/users?username=${userDto.username}`,
        {
          headers: { Authorization: `Bearer ${token}` },
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
        }),
        axios.get(`${config.url}/admin/realms/${config.realm}/users`, {
          params: { email, exact: true },
          headers: { Authorization: `Bearer ${token}` },
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
      },
    );
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
      const { data } = await axios.post(
        `${config.url}/realms/${config.realm}/protocol/openid-connect/token`,
        params,
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
      );
      return data;
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
      `${config.url}/admin/realms/${config.realm}/password-policy`,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    return data;
  }
}
