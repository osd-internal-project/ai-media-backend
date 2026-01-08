import {
  Injectable,
  Logger,
  InternalServerErrorException,
  BadRequestException,
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
        firstName: userDto.fullname?.split(' ')[0] || userDto.username,
        lastName: userDto.fullname?.split(' ').slice(1).join(' ') || '',
        email: userDto.email || '',
        emailVerified: false,
        enabled: true,
      };
      Logger.debug(newUser);
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
      Logger.debug(users);

      if (!users.length) {
        Logger.error('User created but not found in Keycloak');
        throw new InternalServerErrorException('Failed to create user ');
      }
      return users[0].id;
    } catch (error) {
      console.error(
        'Error creating user in Keycloak:',
        error?.response?.data || error.message,
      );
      Logger.error(
        `Failed to create Keycloak user: ${error?.response?.data?.errorMessage || error.message
        }`,
      );
      throw new BadRequestException(`Failed to create user`);
    }
  }

  async updateUser(userId: string, userDto: any) {
    const config = configs().keycloak;
    const token = await this.getAdminToken();

    const updatePayload: any = {
      email: userDto.email,
      firstName: userDto.fullname?.split(' ')[0],
      lastName: userDto.fullname?.split(' ').slice(1).join(' '),
      enabled: userDto.status === 'active',
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

    Logger.log(
      `Login attempt for user: ${loginDto.username} to Realm: ${config.realm} at URL: ${config.url}`,
    );

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
}
