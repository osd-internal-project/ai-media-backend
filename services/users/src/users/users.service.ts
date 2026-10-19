import { CreditBalance, Prisma } from '@prisma/client';
import {
  Injectable,
  Logger,
  ConflictException,
  BadRequestException,
  InternalServerErrorException,
  NotFoundException,
  ForbiddenException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { RegisterUserDto } from './dto/register-user.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import {
  UsersRepository,
  GroupsRepository,
  OrganizationMemberRepository,
  OrganizationRepository,
  ProjectMemberRepository,
  ProjectRepository,
  PlanRepository,
  RegisterRepository,
  RequestChangePasswordRepository,
  OrganizationSubscriptionRepository,
  CreditBalanceRepository,
  LlmGatewayService,
  AuthUser,
} from '@ai-media/share';
import { v4 as uuidv4 } from 'uuid';
import * as dayjs from 'dayjs';
import axios from 'axios';
import configs from 'src/configs';
import { KeycloakService } from 'src/keycloak/keycloak.service';
import { firstValueFrom } from 'rxjs';
import { HttpService } from '@nestjs/axios';
import crypto from 'crypto';
import { checkPasswordPolicy } from './password-policy';

@Injectable()
export class UsersService {
  constructor(
    private readonly userRepo: UsersRepository,
    private readonly groupRepo: GroupsRepository,
    private readonly organizationMemberRepo: OrganizationMemberRepository,
    private readonly organizationRepo: OrganizationRepository,
    private readonly projectRepo: ProjectRepository,
    private readonly projectMemberRepo: ProjectMemberRepository,
    @Inject(forwardRef(() => KeycloakService)) private readonly keycloakService: KeycloakService,
    private readonly planRepo: PlanRepository,
    private readonly httpService: HttpService,
    private readonly registerRepo: RegisterRepository,
    private readonly requestChangePasswordRepo: RequestChangePasswordRepository,
    private readonly organizationSubscriptionRepo: OrganizationSubscriptionRepository,
    private readonly creditBalanceRepo: CreditBalanceRepository,
    private readonly llmGateway: LlmGatewayService,
  ) {}

  /**
   * Provisions the organization's LLM gateway API key.
   *
   * Deliberately non-blocking: a gateway outage must never fail account creation. When this
   * returns null the key stays NULL and `services/core` mints it lazily on the first
   * generation, so the only cost is a slower first generate.
   *
   * @param organizationId Organization UUID.
   */
  private async provisionLlmApiKey(organizationId: string): Promise<void> {
    const apiKey = await this.llmGateway.getOrCreateApiKey(organizationId);
    if (!apiKey) {
      Logger.warn(
        `No LLM gateway API key provisioned for organization ${organizationId}; it will be created on first generation`,
      );
    }
  }

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

    // Explicit check in Keycloak
    const keycloakUsers = await this.keycloakService.findUserByUsernameOrEmail(
      createUserDto.username,
      createUserDto.email,
    );
    if (keycloakUsers.length > 0) {
      Logger.error('User already exists in Keycloak (found by explicit check)');
      throw new ConflictException('User already exists');
    }

    const token = await this.keycloakService.createUser(createUserDto);
    const emailPayload = {
      to: createUserDto.email,
      subject: `Hello, ${createUserDto.username}!`,
      template: 'welcome',
      context: {
        name: createUserDto.username,
        email: createUserDto.email,
        action_url: `${configs().frontendUrl}/verify-email?token=${token}`,
      },
    };

    try {
      const emailApiUrl = configs().emailApiUrl;
      const { data } = await firstValueFrom(
        this.httpService.post(`${emailApiUrl}/email/send`, emailPayload),
      );
      Logger.log(`Email sent: ${JSON.stringify(data)}`);
    } catch (error) {
      Logger.error(`Failed to send email: ${error.message}`);
      // Not throwing error to avoid rolling back invitation? Or should we?
      // Usually better to log failure but leave invitation pending so admin can resend or manual link.
    }

    // Mock Email Dispatch (Legacy)
    console.log(
      `[Email Service] Sending invitation to ${
        createUserDto.email
      } with link: ${configs().frontendUrl}/accept-invite?token=${token}`,
    );

    return this.userRepo.create({
      data: {
        ...userData,
        token,
        groups: {
          create: groups?.map((gid: string) => ({
            group: { connect: { groupId: gid } },
          })),
        },
        status: 'verified',
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
    const { username, groups, password, confirmPassword, ...userData } =
      updateUserDto;

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

  async checkVerifyEmail(tokenRegister: string) {
    const register = await this.registerRepo.findOne({
      where: { token: tokenRegister },
    });
    if (!register) {
      Logger.error('User not found');
      throw new NotFoundException('User not found');
    }
    return register;
  }

  async verifyEmail(tokenRegister: string, password: string) {
    const register = await this.registerRepo.findOne({
      where: { token: tokenRegister },
    });
    if (!register) {
      Logger.error('User not found');
      throw new NotFoundException('User not found');
    }
    const tokenKeycloak = await this.keycloakService.createUser({
      username: register.username,
      password: password,
      email: register.email,
      fullname: register.fullname,
    });

    if (!tokenKeycloak) {
      Logger.error('Failed to create user in Keycloak');
      throw new InternalServerErrorException(
        'Failed to create user in Keycloak',
      );
    }

    const newUser = await this.userRepo.create({
      data: {
        email: register.email,
        username: register.username,
        fullname: register.fullname,
        status: 'active',
        phoneNumber: register.phoneNumber,
        token: tokenKeycloak,
      },
    });

    const userId = newUser.userId;
    await this.provisionPersonalAccount(userId, register.username);

    await this.registerRepo.update({
      where: { token: register.token },
      data: {
        isVerify: true,
      },
    });

    return { message: 'User registered successfully', userId };
  }

  async register(dto: RegisterUserDto) {
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

    const keycloakUsers = await this.keycloakService.findUserByUsernameOrEmail(
      dto.username,
      dto.email,
    );

    if (keycloakUsers.length > 0) {
      Logger.error('User already exists in Keycloak (found by explicit check)');
      throw new ConflictException('User already exists');
    }

    // const passwordPolicy = await this.keycloakService.getPasswordPolicy();
    // if (passwordPolicy) {
    //   this.validatePasswordPolicy(dto.password, passwordPolicy);
    // }

    const token =
      Math.random().toString(36).substring(2, 15) +
      Math.random().toString(36).substring(2, 15);
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 48);

    const register = await this.registerRepo.create({
      data: {
        ...dto,
        token,
      },
    });

    const emailPayload = {
      to: dto.email,
      subject: `Hello, ${dto.username}!`,
      template: 'welcome',
      context: {
        name: dto.username,
        email: dto.email,
        action_url: `${configs().frontendUrl}/verify-email?token=${token}`,
      },
    };

    try {
      const emailApiUrl = configs().emailApiUrl;
      const { data } = await firstValueFrom(
        this.httpService.post(`${emailApiUrl}/email/send`, emailPayload),
      );
      Logger.log(`Email sent: ${JSON.stringify(data)}`);
    } catch (error) {
      Logger.error(`Failed to send email: ${error.message}`);
    }

    console.log(
      `[Email Service] Sending welcome email to ${dto.email} with link: ${
        configs().frontendUrl
      }/verify-email?token=${token}`,
    );
    return register;
  }

  async requestChangePassword(email: string) {
    const user = await this.userRepo.findOne({
      where: { email: email },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const token = uuidv4();
    const expiredAt = dayjs().add(10, 'minute').toDate();

    await this.requestChangePasswordRepo.create({
      data: {
        email: user.email,
        username: user.username,
        token: token,
        status: 'PENDING',
        expiresAt: expiredAt,
      },
    });

    try {
      const emailPayload = {
        to: user.email,
        subject: `Reset Password`,
        template: 'resetpassword',
        context: {
          username: user.username, // Or fetch Org Name
          email: user.email,
          action_url: `${configs().frontendUrl}/change-password?token=${token}`,
        },
      };

      const { data } = await firstValueFrom(
        this.httpService.post(
          `${configs().emailApiUrl}/email/send`,
          emailPayload,
        ),
      );
      Logger.log(`Email sent: ${JSON.stringify(data)}`);
    } catch (error) {
      Logger.error(`Failed to send email: ${error.message}`);
    }

    return { message: 'Email sent successfully' };
  }

  async checkResetPassword(token: string) {
    const request = await this.requestChangePasswordRepo.findOne({
      where: { token, status: 'PENDING' },
    });

    if (!request) {
      throw new NotFoundException('Token not found or expired');
    }

    const isExpired = dayjs().isAfter(dayjs(request.expiresAt));
    if (isExpired) {
      await this.requestChangePasswordRepo.update({
        where: { id: request.id },
        data: { status: 'EXPIRED' },
      });
      throw new BadRequestException('Token expired');
    }

    return request;
  }

  async createFirstUser(register: { email: string, username: string, fullname: string, phoneNumber: string, tokenKeycloak: string, firstName: string }) {
    // Prisma ตัด `email: undefined` ทิ้ง → findOne จะได้ user คนแรกของตาราง
    if (!register.email) {
      throw new BadRequestException('Identity provider returned no email');
    }
    const existingUser = await this.userRepo.findOne({
      where: { email: register.email },
      select: {
        recentOrganizationId: true,
        username: true,
        email: true,
        status: true,
        userId: true,
        role: true,
      }
    });
    if (existingUser) {
      return existingUser
    }
    const newUser = await this.userRepo.create({
      data: {
        email: register.email,
        username: register.username,
        fullname: register.fullname,
        status: 'active',
        phoneNumber: register.phoneNumber,
        token: register.tokenKeycloak,
      },
    });

    const userId = newUser.userId;
    await this.provisionPersonalAccount(
      userId,
      register.firstName || register.username,
    );

    // Return the newly created user
    return this.userRepo.findOne({
      where: { userId },
      select: {
        recentOrganizationId: true,
        username: true,
        email: true,
        status: true,
        userId: true,
        role: true,
      }
    });
  }

  /** personal org + OWNER + CreditBalance 50000/3 + project ของ user ใหม่ — ใช้ร่วมกันระหว่าง web register และ SSO */
  private async provisionPersonalAccount(userId: string, displayName: string) {
    const personalOrg = await this.organizationRepo.create({
      data: {
        name: `${displayName} Personal`,
        slug: `${displayName}-personal`,
        type: 'personal',
        createdById: userId,
        status: true,
        // packageImageAmount: maxDefaultImage,
        // packageTokenAmount: maxDefaultToken,
        // remainImageAmount: maxDefaultImage,
        // remainTokenAmount: maxDefaultToken,

        maxUserAccess: 1,
      },
    });

    if (personalOrg) {
      await this.provisionLlmApiKey(personalOrg.organizationId);

      await this.organizationMemberRepo.create({
        data: {
          organizationId: personalOrg.organizationId,
          userId: userId,
          role: 'OWNER',
        },
      });
      await this.creditBalanceRepo.create({
        data: {
          organizationId: personalOrg.organizationId,
          currentCycleBalance: 0,
          currentCycleImage: 0,
          onTopBalance: 50000,
          onTopImage: 3,
        },
      });
      const personalProject = await this.projectRepo.create({
        data: {
          name: `${displayName} Project`,
          organizationId: personalOrg.organizationId,
          status: 'active',
          limitCreditAllowance: 50000,
          limitImageAllowance: 3,
          usedCreditAllowance: 0,
          usedImageAllowance: 0,
        },
      });

      if (personalProject) {
        await this.projectMemberRepo.create({
          data: {
            projectId: personalProject.id,
            userId: userId,
            role: 'OWNER',
            maxImages: 3,
            maxToken: 50000,
            limitCreditAllowance: 50000,
            limitImageAllowance: 3,
          },
        });
      }

      await this.userRepo.update({
        where: { userId },
        data: {
          recentOrganizationId: personalOrg.organizationId,
        },
      });
    }
  }

  async confirmChangePassword(body: any) {
    const { token, newPassword } = body;
    const request = await this.checkResetPassword(token);

    const user = await this.userRepo.findOne({
      where: { email: request.email },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Check Password Policy
    const passwordPolicy = await this.keycloakService.getPasswordPolicy();
    this.validatePasswordPolicy(newPassword, passwordPolicy);

    // Update Password in Keycloak
    try {
      await this.keycloakService.updateUser(user.token, {
        password: newPassword,
      });
    } catch (error) {
      throw new InternalServerErrorException('Failed to update password');
    }

    // Update Request Status
    await this.requestChangePasswordRepo.update({
      where: { id: request.id },
      data: { status: 'ACCEPTED' },
    });

    return { message: 'Password updated successfully' };
  }

  /** เปลี่ยนรหัสของตัวเอง — ยืนยันรหัสเดิมด้วย Keycloak password grant ก่อน */
  async changeMyPassword(
    authUser: AuthUser | undefined,
    dto: ChangePasswordDto,
  ) {
    // 403 not 401 — same reasoning as bulk-members: a 401 makes the frontend loop on re-login
    if (!authUser) throw new ForbiddenException('Missing authenticated user');
    const user = await this.userRepo.findOne({
      where: { userId: authUser.userId },
    });
    if (!user) throw new NotFoundException('User not found');

    try {
      await this.keycloakService.login({
        username: user.username,
        password: dto.currentPassword,
      });
    } catch {
      // login() logs the Keycloak reason; Google/Microsoft-only accounts also land here
      throw new BadRequestException('Current password is incorrect');
    }

    const passwordPolicy = await this.keycloakService.getPasswordPolicy();
    this.validatePasswordPolicy(dto.newPassword, passwordPolicy);

    try {
      await this.keycloakService.updateUser(user.token, {
        password: dto.newPassword,
      });
    } catch (error) {
      Logger.error(
        `Failed to change password for ${user.userId}: ${error?.message}`,
      );
      throw new InternalServerErrorException('Failed to update password');
    }
    return { message: 'Password updated successfully' };
  }

  private validatePasswordPolicy(password: string, policy: string) {
    const error = checkPasswordPolicy(password, policy);
    if (error) throw new BadRequestException(error);
  }
}
