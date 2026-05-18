import {
  Injectable,
  InternalServerErrorException,
  Logger,
  ConflictException,
} from '@nestjs/common';
import { ApproveInviteUserDto } from './dto/approve-invite-user.dto';
import { CreateInvitationDto } from './dto/create-invitation.dto';
import { AcceptInvitationDto } from './dto/accept-invitation.dto';
import {
  InvitationRepository,
  OrganizationMemberRepository,
  OrganizationRepository,
  ProjectMemberRepository,
  ProjectRepository,
  UsersRepository,
  PlanRepository,
  PlanPriceRepository,
  OrganizationSubscriptionRepository,
  CreditBalanceRepository,
  PackageTransactionRepository,
} from '@ai-media/share';
import { Prisma } from '@prisma/client';
import { KeycloakService } from 'src/keycloak/keycloak.service';
import { HttpService } from '@nestjs/axios';
import configs from 'src/configs';
import { firstValueFrom } from 'rxjs';
import * as dayjs from 'dayjs';

@Injectable()
export class OrganizationService {
  constructor(
    private readonly organizationRepo: OrganizationRepository,
    private readonly organizationMemberRepo: OrganizationMemberRepository,
    private readonly projectMemberRepo: ProjectMemberRepository,
    private readonly projectRepo: ProjectRepository,
    private readonly invitationRepo: InvitationRepository,
    private readonly usersRepo: UsersRepository,
    private readonly keycloakService: KeycloakService,
    private readonly httpService: HttpService,
    private readonly planRepo: PlanRepository,
    private readonly planPriceRepo: PlanPriceRepository,
    private readonly packageTransactionRepo: PackageTransactionRepository,
    private readonly creditBalanceRepo: CreditBalanceRepository,
    private readonly organizationSubscriptionRepo: OrganizationSubscriptionRepository,
  ) {}

  create(createOrganizationDto: Prisma.OrganizationCreateInput) {
    return this.organizationRepo.create({
      data: createOrganizationDto,
    });
  }

  async createOwner(createOrganizationDto: Prisma.OrganizationCreateInput) {
    const data = await this.organizationRepo.create({
      data: createOrganizationDto,
    });
    if (data) {
      await this.organizationMemberRepo.create({
        data: {
          organizationId: data.organizationId,
          userId: createOrganizationDto.createdById,
          role: 'OWNER',
          maxImages: 0, //fix token
          maxToken: 0, //fix token
        },
      });
    }
    return data;
  }
  async createBySystemAdmin(createOrganizationDto: {
    name: string;
    description: string;
    planId: string;
    priceId: string;
    type: string;
    createdById: string;
    slug: string;
  }) {
    //Package Detail
    const plan = await this.planRepo.findOne({
      where: { id: createOrganizationDto.planId },
    });
    const price = await this.planPriceRepo.findOne({
      where: { id: createOrganizationDto.priceId },
    });
    //Calculate Date
    const startDate = new Date(); //Start Date

    const planDetails = plan.detailJson as any;
    const imageAllowance = planDetails?.imageAllowance || 0;
    const creditAllowance = planDetails?.creditAllowance || 0;
    const maxUserAccess = planDetails?.maxUserAccess || 0;
    const periodCount = price.periodCount || 1;
    const endDate = dayjs(startDate).add(1, 'month').add(-1, 'day').toDate(); //End used for check date
    const billingDate = dayjs(startDate)
      .add(periodCount, 'month')
      .add(-1, 'day')
      .toDate(); //Billing Date
    const organization = await this.organizationRepo.create({
      data: {
        name: createOrganizationDto.name,
        description: createOrganizationDto.description,
        type: createOrganizationDto.type,
        createdById: createOrganizationDto.createdById,
        slug: createOrganizationDto.name + '-team',
        status: true,
        maxUserAccess: maxUserAccess,
      },
    });
    const packageTransaction = await this.packageTransactionRepo.create({
      data: {
        organizationId: organization.organizationId,
        planName: plan.name,
        planInterval: price.interval,
        amountPaid: price.price,
        currency: price.currency,
        status: 'complete',
        paymentMethod: 'stripe',
        paidAt: new Date(),
        billingPeriodStart: startDate,
        billingPeriodEnd: billingDate,
      },
    });
    const organizationSubscription =
      await this.organizationSubscriptionRepo.create({
        data: {
          organizationId: organization.organizationId,
          planId: plan.id,
          planName: plan.name,
          price: price.price,
          interval: price.interval,
          creditAllowance: creditAllowance,
          imageAllowance: imageAllowance,
          currentPeriodStart: startDate,
          currentPeriodEnd: endDate,
          nextBillingDate: billingDate,
          status: 'active',
          periodCount: price.periodCount,
          periodCurrent: 1,
          nextPlanId: plan.id,
          nextPlanPriceId: price.id,
          autoRenew: true,
        },
      });
    const currentCreditBalance = await this.creditBalanceRepo.create({
      data: {
        organizationId: organization.organizationId,
        currentCycleBalance: creditAllowance,
        currentCycleImage: imageAllowance,
        onTopBalance: 0,
        onTopImage: 0,
        holdBalance: 0,
        holdImage: 0,
      },
    });
    return {
      packageTransaction,
      organizationSubscription,
      currentCreditBalance,
    };
  }
  async createInvitation(dto: CreateInvitationDto) {
    // 1. Check if user already exists in Organization (via OrganizationMember check if we had userId, but here we only have email)
    // We strictly follow requirements: Check if email exists in OrganizationMember.
    // Since OrganizationMember links to User, we find user by email first.
    const user = await this.usersRepo.findOne({ where: { email: dto.email } });
    if (user) {
      const member = await this.organizationMemberRepo.findOne({
        where: { organizationId: dto.organizationId, userId: user.userId },
      });
      if (member) {
        throw new ConflictException(
          'User is already a member of this organization',
        );
      }
    }

    // 2. Check for existing pending invitation
    const existingInvite = await this.invitationRepo.findOne({
      where: {
        email: dto.email,
        organizationId: dto.organizationId,
        status: 'PENDING',
      },
    });

    const token =
      Math.random().toString(36).substring(2, 15) +
      Math.random().toString(36).substring(2, 15);
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 48);

    if (existingInvite) {
      // Update existing
      await this.invitationRepo.update({
        where: { id: existingInvite.id },
        data: {
          token,
          expiresAt,
          role: dto.role || 'MEMBER',
        },
      });
    } else {
      // Create new
      await this.invitationRepo.create({
        data: {
          email: dto.email,
          organizationId: dto.organizationId,
          role: dto.role || 'MEMBER',
          token,
          expiresAt,
          status: 'PENDING',
        },
      });
    }

    const organization = await this.organizationRepo.findOne({
      where: { organizationId: dto.organizationId },
    });
    // Email Dispatch
    const emailPayload = {
      to: dto.email,
      subject: `You are invited to join ${organization.name}!`,
      template: 'invite',
      context: {
        teamName: organization.name, // Or fetch Org Name
        email: dto.email,
        action_url: `${configs().frontendUrl}/accept-invite?token=${token}`,
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
      `[Email Service] Sending invitation to ${dto.email} with link: ${
        configs().frontendUrl
      }/accept-invite?token=${token}`,
    );

    return { message: 'Invitation sent', token };
  }

  async verifyInvitation(token: string) {
    const invite = await this.invitationRepo.findOne({
      where: { token, status: 'PENDING' },
      include: { organization: true },
    });

    if (!invite) {
      throw new ConflictException('Invalid or expired invitation token');
    }

    if (new Date() > invite.expiresAt) {
      await this.invitationRepo.update({
        where: { id: invite.id },
        data: { status: 'EXPIRED' },
      });
      throw new ConflictException('Invitation expired');
    }

    const user = await this.usersRepo.findOne({
      where: { email: invite.email },
    });

    return {
      email: invite.email,
      organizationName: (invite as any).organization?.name,
      role: invite.role,
      organizationId: invite.organizationId,
      hasAccount: !!user,
      username: user?.username,
      fullname: user?.fullname,
      phoneNumber: user?.phoneNumber,
    };
  }

  async acceptInvitation(dto: AcceptInvitationDto) {
    const invite = await this.invitationRepo.findOne({
      where: { token: dto.token, status: 'PENDING' },
    });

    if (!invite) {
      throw new ConflictException('Invalid or expired invitation token');
    }

    if (new Date() > invite.expiresAt) {
      await this.invitationRepo.update({
        where: { id: invite.id },
        data: { status: 'EXPIRED' },
      });
      throw new ConflictException('Invitation expired');
    }

    let userId: string;
    const existingUser = await this.usersRepo.findOne({
      where: { email: invite.email },
    });

    if (existingUser) {
      userId = existingUser.userId;
    } else {
      if (!dto.username || !dto.password || !dto.fullname) {
        throw new ConflictException(
          'New user registration requires username, password, and fullname',
        );
      }
      const token = await this.keycloakService.createUser({
        username: dto.username,
        password: dto.password,
        email: invite.email,
        firstName: dto.fullname,
        lastName: dto.fullname,
      });
      console.log(`token`, token);
      if (!token) {
        Logger.error('Failed to create user in Keycloak');
        throw new InternalServerErrorException(
          'Failed to create user in Keycloak',
        );
      }
      const newUser = await this.usersRepo.create({
        data: {
          email: invite.email,
          username: dto.username,
          fullname: dto.fullname,
          status: 'active',
          phoneNumber: dto.phoneNumber,
          token,
          recentOrganizationId: invite.organizationId,
        },
      });
      userId = newUser.userId;

      const personalOrg = await this.organizationRepo.create({
        data: {
          name: `${dto.username} Personal`,
          slug: `${dto.username}-personal`,
          type: 'personal',
          createdById: userId,
          status: true,
          maxUserAccess: 1,
        },
      });

      if (personalOrg) {
        // Add User as Owner of Personal Org
        await this.creditBalanceRepo.create({
          data: {
            organizationId: personalOrg.organizationId,
            onTopBalance: 50000,
            onTopImage: 3,
          },
        });
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
            limitCreditAllowance: 50000,
            limitImageAllowance: 3,
            remainImageAmount: 0,
            remainTokenAmount: 0,
          },
        });

        if (personalProject) {
          // Add User as Owner of Personal Project
          await this.projectMemberRepo.create({
            data: {
              projectId: personalProject.id,
              userId: userId,
              role: 'OWNER',

              limitCreditAllowance: 50000,
              limitImageAllowance: 3,
            },
          });
        }
      }
    }

    // Create Organization Member
    await this.organizationMemberRepo.create({
      data: {
        organizationId: invite.organizationId,
        userId: userId,
        role: invite.role,
      },
    });

    // Update Invitation Status
    await this.invitationRepo.update({
      where: { id: invite.id },
      data: { status: 'ACCEPTED' },
    });

    return {
      message: 'Invitation accepted',
      organizationId: invite.organizationId,
    };
  }
  async findAccessCodeByOrganizationId(organizationId: string) {
    const organization = await this.organizationRepo.findOne({
      where: { organizationId },
    });
    return organization.accessCodes;
  }
  findAll(search: { searchText?: string; type?: string }) {
    return this.organizationRepo.findMany({
      where: {
        ...(search.type && { type: search.type }),
        ...(search.searchText && { name: { contains: search.searchText } }),
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findManyByUserId(userId: string, search: { type: string }) {
    // console.log(userId);
    const user = await this.usersRepo.findOne({
      where: { userId },
    });
    return this.organizationRepo.findMany({
      where: {
        type: search.type,
        OR: [
          ...(user.role !== 'SUPER_ADMIN' && [
            {
              organizationMember: { some: { userId } },
            },
          ]),
          { createdById: userId },
        ],
      },
    });
  }

  findOne(id: string) {
    return this.organizationRepo.findOne({
      where: { organizationId: id },
      include: {
        subscription: true,
        creditBalance: true,
      },
    });
  }

  update(id: string, updateOrganizationDto: Prisma.OrganizationUpdateInput) {
    return this.organizationRepo.update({
      where: { organizationId: id },
      data: updateOrganizationDto,
    });
  }

  remove(id: string) {
    return this.organizationRepo.delete({
      where: { organizationId: id },
    });
  }
}
