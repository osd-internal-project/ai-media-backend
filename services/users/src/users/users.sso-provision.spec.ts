import {
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import {
  CreditBalanceRepository,
  GroupsRepository,
  LlmGatewayService,
  OrganizationMemberRepository,
  OrganizationRepository,
  OrganizationSubscriptionRepository,
  PlanPriceRepository,
  PlanRepository,
  ProjectMemberRepository,
  ProjectRepository,
  RegisterRepository,
  RequestChangePasswordRepository,
  UsersRepository,
} from '@ai-media/share';
import { KeycloakService } from 'src/keycloak/keycloak.service';
import { UsersService } from './users.service';

const ssoUser = {
  email: 'new@gmail.com',
  username: 'new@gmail.com',
  fullname: 'New User',
  phoneNumber: '',
  tokenKeycloak: 'kc-sub-1',
  firstName: 'New',
};

describe('UsersService.createFirstUser (SSO)', () => {
  let service: UsersService;
  const userRepo = {
    findOne: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  };
  const creditBalanceRepo = { create: jest.fn() };
  const organizationRepo = { create: jest.fn() };
  const projectRepo = { create: jest.fn() };
  const memberRepo = { create: jest.fn() };
  const projectMemberRepo = { create: jest.fn() };
  const planRepo = { findOne: jest.fn() };
  const planPriceRepo = { findOne: jest.fn() };
  const freePlan = {
    id: 'plan-free',
    accessCodes: ['image', 'video'],
    detailJson: { creditAllowance: 150 },
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: UsersRepository, useValue: userRepo },
        { provide: CreditBalanceRepository, useValue: creditBalanceRepo },
        { provide: OrganizationRepository, useValue: organizationRepo },
        { provide: ProjectRepository, useValue: projectRepo },
        { provide: OrganizationMemberRepository, useValue: memberRepo },
        { provide: ProjectMemberRepository, useValue: projectMemberRepo },
        { provide: PlanRepository, useValue: planRepo },
        { provide: PlanPriceRepository, useValue: planPriceRepo },
        {
          provide: LlmGatewayService,
          useValue: { getOrCreateApiKey: jest.fn().mockResolvedValue('k') },
        },
        ...[
          GroupsRepository,
          KeycloakService,
          HttpService,
          RegisterRepository,
          RequestChangePasswordRepository,
          OrganizationSubscriptionRepository,
        ].map((provide) => ({ provide, useValue: {} })),
      ],
    }).compile();
    service = moduleRef.get(UsersService);
  });

  it('rejects a missing email instead of matching an arbitrary user', async () => {
    await expect(
      service.createFirstUser({ ...ssoUser, email: '' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(userRepo.findOne).not.toHaveBeenCalled();
  });

  it('returns the existing user without creating anything', async () => {
    userRepo.findOne.mockResolvedValue({ userId: 'u-1' });
    expect(await service.createFirstUser(ssoUser)).toEqual({ userId: 'u-1' });
    expect(userRepo.create).not.toHaveBeenCalled();
  });

  it('gives a new SSO user a personal org funded by the free plan', async () => {
    planRepo.findOne.mockResolvedValue(freePlan);
    planPriceRepo.findOne.mockResolvedValue({
      creditAllowance: 50,
      imageAllowance: 0,
    });
    userRepo.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ userId: 'u-2', recentOrganizationId: 'org-2' });
    userRepo.create.mockResolvedValue({ userId: 'u-2' });
    organizationRepo.create.mockResolvedValue({ organizationId: 'org-2' });
    projectRepo.create.mockResolvedValue({ id: 'p-2' });

    const user = await service.createFirstUser(ssoUser);

    expect(user).toEqual({ userId: 'u-2', recentOrganizationId: 'org-2' });
    expect(userRepo.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ token: 'kc-sub-1', email: 'new@gmail.com' }),
    });
    expect(creditBalanceRepo.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: 'org-2',
        onTopBalance: 50,
        onTopImage: 0,
      }),
    });
    expect(planPriceRepo.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ where: { planId: 'plan-free' } }),
    );
    expect(organizationRepo.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: 'personal',
        accessCodes: ['image', 'video'],
      }),
    });
    expect(projectRepo.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ limitCreditAllowance: 50 }),
    });
    expect(projectMemberRepo.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ maxToken: 50, limitCreditAllowance: 50 }),
    });
    expect(memberRepo.create).toHaveBeenCalledWith({
      data: { organizationId: 'org-2', userId: 'u-2', role: 'OWNER' },
    });
  });

  it('fails before creating an org when no free plan is configured', async () => {
    planRepo.findOne.mockResolvedValue(null);
    userRepo.findOne.mockResolvedValueOnce(null);
    userRepo.create.mockResolvedValue({ userId: 'u-3' });

    await expect(service.createFirstUser(ssoUser)).rejects.toBeInstanceOf(
      InternalServerErrorException,
    );
    expect(organizationRepo.create).not.toHaveBeenCalled();
  });
});
