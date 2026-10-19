import { ForbiddenException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { NEVER } from 'rxjs';
import {
  CreditBalanceRepository,
  InvitationRepository,
  LlmGatewayService,
  OrganizationMemberRepository,
  OrganizationRepository,
  OrganizationSubscriptionRepository,
  PackageTransactionRepository,
  PlanPriceRepository,
  PlanRepository,
  ProjectMemberRepository,
  ProjectRepository,
  UsersRepository,
} from '@ai-media/share';
import { KeycloakService } from 'src/keycloak/keycloak.service';
import { OrganizationService } from './organization.service';

const invite = {
  id: 'inv-1',
  email: 'B@Example.com',
  organizationId: 'org-1',
  role: 'MEMBER',
  token: 'tok',
  status: 'PENDING',
  expiresAt: new Date(Date.now() + 60_000),
};

describe('OrganizationService invitations', () => {
  let service: OrganizationService;
  const invitationRepo = {
    findOne: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
  };
  const usersRepo = { findOne: jest.fn(), update: jest.fn() };
  const memberRepo = { findOne: jest.fn(), create: jest.fn() };

  beforeEach(async () => {
    jest.resetAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        OrganizationService,
        { provide: InvitationRepository, useValue: invitationRepo },
        { provide: UsersRepository, useValue: usersRepo },
        { provide: OrganizationMemberRepository, useValue: memberRepo },
        { provide: HttpService, useValue: { post: jest.fn() } },
        ...[
          OrganizationRepository,
          ProjectMemberRepository,
          ProjectRepository,
          KeycloakService,
          PlanRepository,
          PlanPriceRepository,
          PackageTransactionRepository,
          CreditBalanceRepository,
          OrganizationSubscriptionRepository,
          LlmGatewayService,
        ].map((provide) => ({ provide, useValue: {} })),
      ],
    }).compile();
    service = moduleRef.get(OrganizationService);
    invitationRepo.findOne.mockResolvedValue(invite);
  });

  it('rejects when the logged-in user is not the invited email', async () => {
    usersRepo.findOne.mockResolvedValue({ userId: 'u-c', email: 'c@x.com' });
    await expect(
      service.acceptInvitation({ token: 'tok', userId: 'kc-c' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(memberRepo.create).not.toHaveBeenCalled();
  });

  it('does not add a second membership and switches the recent org', async () => {
    usersRepo.findOne.mockResolvedValue({
      userId: 'u-b',
      email: 'b@example.com',
    });
    memberRepo.findOne.mockResolvedValue({ id: 'm-1' });
    const result = await service.acceptInvitation({
      token: 'tok',
      userId: 'kc-b',
    });
    expect(result.organizationId).toBe('org-1');
    expect(memberRepo.create).not.toHaveBeenCalled();
    expect(usersRepo.update).toHaveBeenCalledWith({
      where: { userId: 'u-b' },
      data: { recentOrganizationId: 'org-1' },
    });
    expect(invitationRepo.update).toHaveBeenCalledWith({
      where: { id: 'inv-1' },
      data: { status: 'ACCEPTED' },
    });
  });

  it('lists only pending, unexpired invitations for the email', async () => {
    invitationRepo.findMany.mockResolvedValue([
      { ...invite, createdAt: new Date(), organization: { name: 'Acme' } },
    ]);
    const result = await service.findPendingInvitations('b@example.com');
    const [{ where }] = invitationRepo.findMany.mock.calls[0];
    expect(where.status).toBe('PENDING');
    expect(where.expiresAt.gt).toBeInstanceOf(Date);
    expect(where.email).toEqual({
      equals: 'b@example.com',
      mode: 'insensitive',
    });
    expect(result[0]).toMatchObject({ token: 'tok', organizationName: 'Acme' });
  });

  it('returns nothing for an empty email', async () => {
    expect(await service.findPendingInvitations('')).toEqual([]);
    expect(invitationRepo.findMany).not.toHaveBeenCalled();
  });

  it('responds without waiting for a hung email send', async () => {
    usersRepo.findOne.mockResolvedValue(null);
    service['organizationRepo'].findOne = jest
      .fn()
      .mockResolvedValue({ name: 'Org' });
    const post = service['httpService'].post as jest.Mock;
    post.mockReturnValue(NEVER);

    const result = await service.createInvitation({
      email: 'b@example.com',
      organizationId: 'org-1',
    } as Parameters<typeof service.createInvitation>[0]);

    expect(result.message).toBe('Invitation sent');
    expect(post).toHaveBeenCalledWith(
      expect.stringContaining('/email/send'),
      expect.objectContaining({ to: 'b@example.com', template: 'invite' }),
    );
  });
});
