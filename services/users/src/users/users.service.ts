import { Prisma } from '@prisma/client';
import {
  Injectable,
  Logger,
  ConflictException,
  BadRequestException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { RegisterUserDto } from './dto/register-user.dto';
import {
  UsersRepository,
  GroupsRepository,
  OrganizationMemberRepository,
  OrganizationRepository,
  ProjectMemberRepository,
  ProjectRepository,
  PlanRepository,
} from '@ai-media/share';

import axios from 'axios';
import configs from 'src/configs';
import { KeycloakService } from 'src/keycloak/keycloak.service';

@Injectable()
export class UsersService {
  constructor(
    private readonly userRepo: UsersRepository,
    private readonly groupRepo: GroupsRepository,
    private readonly organizationMemberRepo: OrganizationMemberRepository,
    private readonly organizationRepo: OrganizationRepository,
    private readonly projectRepo: ProjectRepository,
    private readonly projectMemberRepo: ProjectMemberRepository,
    private readonly keycloakService: KeycloakService,
    private readonly planRepo: PlanRepository,
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
    const token = await this.keycloakService.createUser(createUserDto);
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
  findDetailByToken(token: string) {
    return this.userRepo.findOne({
      where: {
        token,
      },
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
  async findOrganizationUserDetails(organizationId: string) {
    const members = await this.organizationMemberRepo.findMany({
      where: {
        organizationId,
      },
    });
    const userIds = members.map((member) => member.userId);
    return this.userRepo.findMany({
      where: {
        userId: {
          in: userIds,
        },
      },
    });
  }
  async update(userId: string, updateUserDto: any) {
    // 1. Update in Keycloak
    // We assume userId is the Keycloak User ID
    const { username, groups, password, ...userData } = updateUserDto;

    try {
      const { token } = await this.userRepo.findOne({ where: { userId } });

      //Token of Users is Keycloak User ID
      await this.keycloakService.updateUser(token, updateUserDto);
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
  async updateDetailByToken(
    token: string,
    updateUserDto: Prisma.usersUpdateInput,
  ) {
    return this.userRepo.updateMany({
      where: { token },
      data: updateUserDto,
    });
  }
  async remove(userId: string) {
    // 1. Delete in Keycloak
    try {
      const user = await this.userRepo.findOne({ where: { userId } });
      if (user && user.token) {
        await this.keycloakService.deleteUser(user.token);
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

  async register(dto: RegisterUserDto) {
    // 1. Check if user already exists
    const existingUser = await this.userRepo.findOne({
      where: {
        OR: [{ email: dto.email }, { username: dto.username }],
      },
    });

    if (existingUser) {
      throw new ConflictException(
        'User with this email or username already exists',
      );
    }

    // 2. Create User in Keycloak
    const token = await this.keycloakService.createUser({
      username: dto.username,
      password: dto.password,
      email: dto.email,
      fullname: dto.fullname,
    });

    if (!token) {
      Logger.error('Failed to create user in Keycloak');
      throw new InternalServerErrorException(
        'Failed to create user in Keycloak',
      );
    }

    // 3. Create User in Database
    const newUser = await this.userRepo.create({
      data: {
        email: dto.email,
        username: dto.username,
        fullname: dto.fullname,
        status: 'active',
        phoneNumber: dto.phoneNumber,
        token,
      },
    });

    const userId = newUser.userId;
    const freePlan = await this.planRepo.findOne({
      where: { isDefault: true },
    });
    const freePlanDetails = freePlan.detailJson as any;
    const maxDefaultImage = freePlanDetails?.packageImageAmount || 0;
    const maxDefaultToken = freePlanDetails?.packageTokenAmount || 0;
    // 4. Auto-create Personal Organization & Project
    const personalOrg = await this.organizationRepo.create({
      data: {
        name: `${dto.username} Personal`,
        slug: `${dto.username}-personal`,
        type: 'personal',
        createdById: userId,
        status: true,
        packageImageAmount: maxDefaultImage,
        packageTokenAmount: maxDefaultToken,
        remainImageAmount: 0,
        remainTokenAmount: 0,
        maxUserAccess: 1,
      },
    });

    if (personalOrg) {
      // Add User as Owner of Personal Org
      await this.organizationMemberRepo.create({
        data: {
          organizationId: personalOrg.organizationId,
          userId: userId,
          role: 'OWNER',
        },
      });

      // Create Personal Project
      const personalProject = await this.projectRepo.create({
        data: {
          name: `${dto.username} Project`,
          organizationId: personalOrg.organizationId,
          status: 'active',
          remainImageAmount: 0,
          remainTokenAmount: 0,
          accessImageAmount: maxDefaultImage,
          accessTokenAmount: maxDefaultToken,
        },
      });

      if (personalProject) {
        // Add User as Owner of Personal Project
        await this.projectMemberRepo.create({
          data: {
            projectId: personalProject.id,
            userId: userId,
            role: 'OWNER',
            maxImages: maxDefaultImage,
            maxToken: maxDefaultToken,
          },
        });
      }

      // Update recentOrganizationId
      await this.userRepo.update({
        where: { userId },
        data: {
          recentOrganizationId: personalOrg.organizationId,
        },
      });
    }

    return { message: 'User registered successfully', userId };
  }
}
