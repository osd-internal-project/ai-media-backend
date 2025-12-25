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
    const { password, groups, ...userData } = createUserDto;
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
    return this.userRepo.create({
      data: {
        ...userData,
        token,
        groups: {
          create: groups?.map((gid: string) => ({
            group: { connect: { groupId: gid } },
          })),
        },
      },
    });
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

  findBySearch(search?: string) {
    return this.userRepo.findMany({
      ...(search && {
        where: {
          OR: [
            { username: { contains: search, mode: 'insensitive' } },
            { fullname: { contains: search, mode: 'insensitive' } },
            { email: { contains: search, mode: 'insensitive' } },
          ],
        },
      }),
      include: { groups: { include: { group: true } } },
      orderBy: { createdAt: 'asc' },
    });
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

  async update(userId: string, updateUserDto: any) {
    // 1. Update in Keycloak
    // We assume userId is the Keycloak User ID
    const { username, groups, password, ...userData } = updateUserDto;

    try {
      const { token } = await this.userRepo.findOne({ where: { userId } });

      //Token of Users is Keycloak User ID
      await this.updateKeycloakUser(token, updateUserDto);
    } catch (error) {
      Logger.error(`Failed to update user in Keycloak: ${error.message}`);
      // Decide if we should block the database update or just log the error.
      // Usually, we want to keep them in sync, so throwing is safer.
      throw new InternalServerErrorException(
        `Failed to update user in Keycloak`,
      );
    }

    // 2. Update in Database
    return this.userRepo.update({
      where: { userId },
      data: {
        ...userData,
        groups: {
          deleteMany: {},
          create: groups?.map((gid: string) => ({
            group: { connect: { groupId: gid } },
          })),
        },
      },
    });
  }
  async updateDetail(userId: string, updateUserDto: Prisma.usersUpdateInput) {
    return this.userRepo.updateMany({
      where: { userId },
      data: { updateUserDto },
    });
  }
  async remove(userId: string) {
    // 1. Delete in Keycloak
    try {
      const user = await this.userRepo.findOne({ where: { userId } });
      if (user && user.token) {
        await this.deleteKeycloakUser(user.token);
      } else {
        Logger.warn(
          `User ${userId} has no Keycloak token/ID, skipping Keycloak deletion`,
        );
      }
    } catch (error) {
      Logger.error(`Failed to delete user in Keycloak: ${error.message}`);
      // Depending on business rule, we might strictly block DB deletion or proceed.
      // Here we choose to throw to alert the admin.
      throw new InternalServerErrorException(
        'Failed to delete user in Keycloak',
      );
    }

    // 2. Remove UserGroup associations to avoid FK constraint error
    await this.userRepo.update({
      where: { userId },
      data: {
        groups: {
          deleteMany: {},
        },
      },
    });

    // 3. Delete in Database
    return this.userRepo.delete({
      where: {
        userId,
      },
    });
  }

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

  private async updateKeycloakUser(userId: string, userDto: any) {
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

    // If password is provided (needs to be handled if it's in DTO)
    // Note: Prisma.usersUpdateInput usually doesn't have 'password' unless added to schema,
    // but the incoming DTO might have it if cast to 'any' or extended.
    // Given the current signature using Prisma generated type, 'password' might not be there directly
    // unless 'usersUpdateInput' has it (it doesn't seem to based on schema).
    // If we need password reset, it's a separate implementation usually, or passed in a custom DTO.

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

  private async deleteKeycloakUser(keycloakUserId: string) {
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
}
