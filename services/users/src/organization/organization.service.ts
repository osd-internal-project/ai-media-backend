import { Injectable, InternalServerErrorException, Logger, ConflictException } from '@nestjs/common';
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
} from '@ai-media/share';
import { Prisma } from '@prisma/client';
import { KeycloakService } from 'src/keycloak/keycloak.service';
import { HttpService } from '@nestjs/axios';
import configs from 'src/configs';
import { firstValueFrom } from 'rxjs';

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
  ) { }

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
          maxImages: 1000000, //fix token
          maxToken: 1000000, //fix token
        },
      });
    }
    return data;
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
        throw new ConflictException('User is already a member of this organization');
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

    const token = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
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

    const organization = await this.organizationRepo.findOne({ where: { organizationId: dto.organizationId } });
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
    console.log(`[Email Service] Sending invitation to ${dto.email} with link: ${configs().frontendUrl}/accept-invite?token=${token}`);

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

    const user = await this.usersRepo.findOne({ where: { email: invite.email } });

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
    const existingUser = await this.usersRepo.findOne({ where: { email: invite.email } });

    if (existingUser) {
      userId = existingUser.userId;
    } else {
      if (!dto.username || !dto.password || !dto.fullname) {
        throw new ConflictException('New user registration requires username, password, and fullname');
      }
      const token = await this.keycloakService.createUser({
        username: dto.username,
        password: dto.password,
        email: invite.email,
        firstName: dto.fullname,
        lastName: dto.fullname,
      });
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

      // Auto-create Personal Organization & Project
      const personalOrg = await this.organizationRepo.create({
        data: {
          name: `${dto.username} Personal`,
          slug: `${dto.username}-personal`,
          type: 'personal',
          createdById: userId,
          status: true,
        },
      });

      if (personalOrg) {
        // Add User as Owner of Personal Org
        await this.organizationMemberRepo.create({
          data: {
            organizationId: personalOrg.organizationId,
            userId: userId,
            role: 'OWNER',
            maxImages: 1000000,
            maxToken: 1000000,
          },
        });

        // Create Personal Project
        const personalProject = await this.projectRepo.create({
          data: {
            name: `${dto.username} Project`,
            organizationId: personalOrg.organizationId,
            status: 'active',
          },
        });

        if (personalProject) {
          // Add User as Owner of Personal Project
          await this.projectMemberRepo.create({
            data: {
              projectId: personalProject.id,
              userId: userId,
              role: 'OWNER',
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
        maxImages: 0,
        maxToken: 0,
      },
    });

    // Update Invitation Status
    await this.invitationRepo.update({
      where: { id: invite.id },
      data: { status: 'ACCEPTED' },
    });

    return { message: 'Invitation accepted', organizationId: invite.organizationId };
  }

  findAll() {
    return this.organizationRepo.findMany({});
  }

  findManyByUserId(userId: string, search: { type: string }) {
    console.log(userId);
    return this.organizationRepo.findMany({
      where: {
        type: search.type,
        OR: [
          { organizationMember: { some: { userId } } },
          { createdById: userId },
        ],
      },
    });
  }

  findOne(id: string) {
    return this.organizationRepo.findOne({
      where: { organizationId: id },
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
