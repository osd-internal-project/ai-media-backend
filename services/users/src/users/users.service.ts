import { Prisma } from '@prisma/client';
import {
  Injectable,
  Logger,
  ConflictException,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { UsersRepository, GroupsRepository } from '@ai-media/share';

import axios from 'axios';
import configs from 'src/configs';

@Injectable()
export class UsersService {
  constructor(
    private readonly userRepo: UsersRepository,
    private readonly groupRepo: GroupsRepository,
  ) {}

  async create(createUserDto: any) {
    const { password, ...userData } = createUserDto;
    const duplicateUser = await this.userRepo.findOne({
      where: {
        OR: [
          { username: createUserDto.username },
          { email: createUserDto.email },
        ],
      },
    });
    if (duplicateUser) {
      Logger.error('User already exists');
      throw new ConflictException('User already exists');
    }
    const token = await this.createKeycloakUser(createUserDto);
    if (!token) {
      Logger.error('Failed to create user in Keycloak');
      throw new InternalServerErrorException(
        'Failed to create user in Keycloak',
      );
    }
    return this.userRepo.create({ data: userData });
  }

  private async getAdminToken(): Promise<string> {
    Logger.debug('getAdminToken');
    const config = configs().keycloak;
    const params = new URLSearchParams();
    params.append('client_id', config.clientId);
    if (!config.clientSecret) {
      Logger.error('Not found client secret');
      throw new InternalServerErrorException('Failed to get create user');
    } else {
      params.append('client_secret', config.clientSecret);
      params.append('grant_type', 'client_credentials');
    }
    Logger.debug(`params ${params}`);
    const { data } = await axios.post(
      `${config.url}/realms/${config.realm}/protocol/openid-connect/token`,
      params,
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
    );
    Logger.debug(data);
    return data.access_token;
  }

  private async createKeycloakUser(userDto: any): Promise<string> {
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
      Logger.debug(`${config.url}/admin/realms/${config.realm}/users`);
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

      // const createdUser = users.find(
      //   (u: any) => u.username === userDto.username,
      // );
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
      // Determine if we should fail or proceed. Usually strictly fail if requirement is "in Keycloak THEN db"
      Logger.error(
        `Failed to create Keycloak user: ${
          error?.response?.data?.errorMessage || error.message
        }`,
      );
      throw new BadRequestException(`Failed to create user`);
    }
  }

  findAll() {
    return this.userRepo.findMany({
      include: { groups: { include: { group: true } } },
      orderBy: { createdAt: 'asc' },
    });
  }
  async summaryData() {
    const [totalUsers, activeUsers, unabledUsers, totalGroups] =
      await Promise.all([
        this.userRepo.count({}),
        this.userRepo.count({ where: { status: 'active' } }),
        this.userRepo.count({ where: { status: 'unabled' } }),
        this.groupRepo.count({}),
      ]);
    return {
      total: totalUsers,
      active: activeUsers,
      unabled: unabledUsers,
      userGroup: totalGroups,
    };
  }

  findOne(userId: string) {
    const getdataUser = this.groupRepo.findOne({
      where: {
        users: {
          some: {
            users: {
              token: userId,
            },
          },
        },
      },
      include: {
        users: {
          include: {
            users: true,
          },
        },
        roles: {
          include: {
            role: true,
          },
        },
      },
    });
    return getdataUser;
  }

  update(userId: string, updateUserDto: Prisma.usersUpdateInput) {
    return this.userRepo.update({
      where: { userId },
      data: {
        ...updateUserDto,
      },
    });
  }

  remove(userId: string) {
    return this.userRepo.delete({
      where: {
        userId,
      },
    });
  }
}
