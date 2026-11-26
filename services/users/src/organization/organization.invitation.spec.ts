import { ConflictException, ForbiddenException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { NEVER } from 'rxjs';
import {
  AuditLogRepository,
  CreditBalanceRepository,
  InvitationRepository,
  LlmGatewayService,
  OrganizationMemberRepository,
  OrganizationRepository,
  OrganizationSubscriptionRepository,
  PackageTransactionRepository,
  PlanPriceRepository,
  PlanRepository,
  UsersRepository,
} from '@ai-media/share';
import { KeycloakService } from 'src/keycloak/keycloak.service';
import { OrganizationService } from './organization.service';
import { OrganizationSeatService } from './organization-seat.service';

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
  const usersRepo = { findOne: jest.fn(), update: jest.fn(), create: jest.fn() };
  const memberRepo = { findOne: jest.fn(), create: jest.fn() };
  const organizationRepo = { findOne: jest.fn(), create: jest.fn() };
  const creditBalanceRepo = { create: jest.fn() };
  const seatService = { assertAvailable: jest.fn() };
  const keycloakService = { createUser: jest.fn() };

  beforeEach(async () => {
    jest.resetAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        OrganizationService,
        { provide: InvitationRepository, useValue: invitationRepo },
        { provide: UsersRepository, useValue: usersRepo },
        { provide: OrganizationMemberRepository, useValue: memberRepo },
        { provide: HttpService, useValue: { post: jest.fn() } },
        { provide: OrganizationRepository, useValue: organizationRepo },
        { provide: CreditBalanceRepository, useValue: creditBalanceRepo },
        { provide: KeycloakService, useValue: keycloakService },
        { provide: OrganizationSeatService, useValue: seatService },
        ...[
          PlanRepository,
          PlanPriceRepository,
          PackageTransactionRepository,
          OrganizationSubscriptionRepository,
          LlmGatewayService,
          AuditLogRepository,
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

  it('joins a new user to the inviting org only, without a personal org', async () => {
    usersRepo.findOne.mockResolvedValue(null);
    keycloakService.createUser.mockResolvedValue('kc-new');
    usersRepo.create.mockResolvedValue({ userId: 'u-new' });
    memberRepo.findOne.mockResolvedValue(null);

    const result = await service.acceptInvitation({
      token: 'tok',
      username: 'newbie',
      password: 'Secret#123',
      fullname: 'New Bie',
    });

    expect(result.organizationId).toBe('org-1');
    expect(usersRepo.create.mock.calls[0][0].data.recentOrganizationId).toBe(
      'org-1',
    );
    expect(organizationRepo.create).not.toHaveBeenCalled();
    expect(creditBalanceRepo.create).not.toHaveBeenCalled();
    expect(memberRepo.create).toHaveBeenCalledTimes(1);
    expect(memberRepo.create).toHaveBeenCalledWith({
      data: { organizationId: 'org-1', userId: 'u-new', role: 'MEMBER' },
    });
    // คำเชิญที่ส่งไปแล้ว (รวมก่อน deploy) รับได้เสมอ แม้ org จะเต็ม
    expect(seatService.assertAvailable).not.toHaveBeenCalled();
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

  it('rejects a new invite when the seats are full, without saving it', async () => {
    usersRepo.findOne.mockResolvedValue(null);
    invitationRepo.findOne.mockResolvedValue(null);
    seatService.assertAvailable.mockRejectedValue(new ConflictException('Seat limit reached'));
    const create = jest.fn();
    service['invitationRepo'].create = create;

    await expect(
      service.createInvitation({
        email: 'c@example.com',
        organizationId: 'org-1',
      } as Parameters<typeof service.createInvitation>[0]),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(seatService.assertAvailable).toHaveBeenCalledWith('org-1', 1);
    expect(create).not.toHaveBeenCalled();
  });

  it('re-sends an existing pending invite without a seat check', async () => {
    usersRepo.findOne.mockResolvedValue(null);
    service['organizationRepo'].findOne = jest.fn().mockResolvedValue({ name: 'Org' });
    (service['httpService'].post as jest.Mock).mockReturnValue(NEVER);

    await service.createInvitation({
      email: 'b@example.com',
      organizationId: 'org-1',
    } as Parameters<typeof service.createInvitation>[0]);
    expect(seatService.assertAvailable).not.toHaveBeenCalled();
  });

  describe('resend and cancel', () => {
    const original = process.env.AUTH_MODE;
    const owner = { userId: 'u-owner', token: 't', role: 'USER' };
    beforeEach(() => {
      process.env.AUTH_MODE = 'report';
      service['organizationRepo'].findOne = jest.fn().mockResolvedValue({ name: 'Org' });
      (service['httpService'].post as jest.Mock).mockReturnValue(NEVER);
      memberRepo.findOne.mockResolvedValue({ role: 'OWNER' });
    });
    afterEach(() => {
      process.env.AUTH_MODE = original;
    });

    it('resends with the same token, a later expiry, and no seat check', async () => {
      const result = await service.resendInvitation('inv-1', owner);
      const [[update]] = invitationRepo.update.mock.calls;
      expect(update.where).toEqual({ id: 'inv-1' });
      expect(Object.keys(update.data)).toEqual(['expiresAt']);
      expect(result.expiresAt.getTime()).toBeGreaterThan(invite.expiresAt.getTime());
      expect(seatService.assertAvailable).not.toHaveBeenCalled();
    });

    it('re-checks seats before reviving an expired invite', async () => {
      invitationRepo.findOne.mockResolvedValue({ ...invite, expiresAt: new Date(Date.now() - 1000) });
      seatService.assertAvailable.mockRejectedValue(new ConflictException('Seat limit reached'));
      await expect(service.resendInvitation('inv-1', owner)).rejects.toBeInstanceOf(ConflictException);
      expect(invitationRepo.update).not.toHaveBeenCalled();
    });

    it('cancels by status, keeping the row', async () => {
      await service.cancelInvitation('inv-1', owner);
      expect(invitationRepo.update).toHaveBeenCalledWith({
        where: { id: 'inv-1' },
        data: { status: 'CANCELLED' },
      });
    });

    it('refuses a plain member and an invite that is no longer pending', async () => {
      memberRepo.findOne.mockResolvedValue({ role: 'MEMBER' });
      await expect(service.cancelInvitation('inv-1', owner)).rejects.toBeInstanceOf(ForbiddenException);
      invitationRepo.findOne.mockResolvedValue({ ...invite, status: 'ACCEPTED' });
      await expect(service.cancelInvitation('inv-1', owner)).rejects.toThrow('Invitation is already accepted');
      expect(invitationRepo.update).not.toHaveBeenCalled();
    });
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
