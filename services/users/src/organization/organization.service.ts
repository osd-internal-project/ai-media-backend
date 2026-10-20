import {
  Injectable,
  InternalServerErrorException,
  Logger,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { ApproveInviteUserDto } from './dto/approve-invite-user.dto';
import { CreateInvitationDto } from './dto/create-invitation.dto';
import { AcceptInvitationDto } from './dto/accept-invitation.dto';
import {
  InvitationRepository,
  OrganizationMemberRepository,
  OrganizationRepository,
  UsersRepository,
  PlanRepository,
  PlanPriceRepository,
  OrganizationSubscriptionRepository,
  CreditBalanceRepository,
  PackageTransactionRepository,
  LlmGatewayService,
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
    private readonly invitationRepo: InvitationRepository,
    private readonly usersRepo: UsersRepository,
    private readonly keycloakService: KeycloakService,
    private readonly httpService: HttpService,
    private readonly planRepo: PlanRepository,
    private readonly planPriceRepo: PlanPriceRepository,
    private readonly packageTransactionRepo: PackageTransactionRepository,
    private readonly creditBalanceRepo: CreditBalanceRepository,
    private readonly organizationSubscriptionRepo: OrganizationSubscriptionRepository,
    private readonly llmGateway: LlmGatewayService,
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
        accessCodes: plan?.accessCodes || [],
      },
    });
    // Non-blocking: a gateway outage must not fail organization creation. When this yields
    // no key, services/core mints one lazily on the first generation.
    const llmApiKey = await this.llmGateway.getOrCreateApiKey(
      organization.organizationId,
    );
    if (!llmApiKey) {
      Logger.warn(
        `No LLM gateway API key provisioned for organization ${organization.organizationId}; it will be created on first generation`,
      );
    }

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

    // SMTP relay อาจค้างนานกว่า ingress 60s — ไม่รอ ให้ invite ตอบทันที
    void this.sendInvitationEmail(emailPayload);
    void this.notifyInvitationChanged(dto.email);

    return { message: 'Invitation sent', token };
  }

  /** คำเชิญที่ยังรอตอบของ email นี้ — ใช้แสดงกระดิ่ง noti */
  async findPendingInvitations(email: string) {
    if (!email) return [];
    const invites = await this.invitationRepo.findMany({
      where: {
        email: { equals: email, mode: 'insensitive' },
        status: 'PENDING',
        expiresAt: { gt: new Date() },
      },
      include: { organization: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return invites.map((invite) => ({
      id: invite.id,
      token: invite.token,
      organizationId: invite.organizationId,
      organizationName: (invite as { organization?: { name: string } })
        .organization?.name,
      role: invite.role,
      expiresAt: invite.expiresAt,
      createdAt: invite.createdAt,
    }));
  }

  /** ส่งเมลเชิญผ่าน email-api — พังได้โดยไม่กระทบการเชิญ (invitation ยัง PENDING ให้ส่งซ้ำได้) */
  private async sendInvitationEmail(payload: Record<string, unknown>) {
    try {
      const { data } = await firstValueFrom(
        this.httpService.post(`${configs().emailApiUrl}/email/send`, payload),
      );
      Logger.log(`Email sent: ${JSON.stringify(data)}`);
    } catch (error) {
      Logger.error(`Failed to send email: ${error.message}`);
    }
  }

  /** ปลุก socket ของผู้ถูกเชิญผ่าน core — พังได้โดยไม่กระทบการเชิญ */
  private async notifyInvitationChanged(email: string) {
    const coreApiUrl = configs().coreApiUrl;
    if (!coreApiUrl) return;
    try {
      await firstValueFrom(
        this.httpService.post(
          `${coreApiUrl}/websocket/notify/invitation`,
          { email },
          // core ตรวจ key นี้ — endpoint อยู่หลัง ingress สาธารณะเดียวกับ API อื่น
          { headers: { 'x-internal-key': process.env.INTERNAL_API_KEY ?? '' } },
        ),
      );
    } catch (error) {
      Logger.warn(
        `Invitation notify failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
  findInvitationsByOrganizationId(organizationId: string) {
    return this.invitationRepo.findMany({
      where: { organizationId },
    });
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
    const existingUser = dto.userId
      ? await this.findSessionInvitee(dto.userId, invite.email)
      : await this.usersRepo.findOne({ where: { email: invite.email } });

    if (existingUser) {
      userId = existingUser.userId;
      await this.usersRepo.update({
        where: { userId },
        data: { recentOrganizationId: invite.organizationId },
      });
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
    }

    // กด accept ซ้ำ/เป็นสมาชิกอยู่แล้วต้องไม่สร้างแถวซ้ำ
    const existingMember = await this.organizationMemberRepo.findOne({
      where: { organizationId: invite.organizationId, userId },
    });
    if (!existingMember) {
      await this.organizationMemberRepo.create({
        data: {
          organizationId: invite.organizationId,
          userId: userId,
          role: invite.role,
        },
      });
    }

    // Update Invitation Status
    await this.invitationRepo.update({
      where: { id: invite.id },
      data: { status: 'ACCEPTED' },
    });

    void this.notifyInvitationChanged(invite.email);

    return {
      message: 'Invitation accepted',
      organizationId: invite.organizationId,
    };
  }

  /** user ที่ login อยู่ต้องเป็นเจ้าของ email ที่ถูกเชิญ */
  private async findSessionInvitee(sessionUserId: string, inviteEmail: string) {
    const user = await this.usersRepo.findOne({
      where: { token: sessionUserId },
    });
    if (!user || user.email?.toLowerCase() !== inviteEmail.toLowerCase()) {
      throw new ForbiddenException(
        'This invitation was sent to a different email address',
      );
    }
    return user;
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

  async findManyByUserId(userId: string, search: { type?: string }) {
    // console.log(userId);
    const { type } = search;
    const user = await this.usersRepo.findOne({
      where: { userId },
    });
    // console.log(user);
    const superAdminRole =
      user.role === 'SUPER_ADMIN' || user.role === 'SYSTEM_ADMIN  ';
    return await this.organizationRepo.findMany({
      where: {
        ...(type && { type: search.type }),
        status: true,
        ...(!superAdminRole && {
          OR: [
            {
              organizationMember: { some: { userId, status: 'active' } },
            },
            { createdById: userId },
          ],
        }),
      },
      orderBy: [{ type: 'asc' }, { createdAt: 'desc' }],
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
