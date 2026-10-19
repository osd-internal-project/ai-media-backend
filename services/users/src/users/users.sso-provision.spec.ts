import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import {
  CreditBalanceRepository,
  GroupsRepository,
  LlmGatewayService,
  OrganizationMemberRepository,
  OrganizationRepository,
  OrganizationSubscriptionRepository,
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
        {
          provide: LlmGatewayService,
          useValue: { getOrCreateApiKey: jest.fn().mockResolvedValue('k') },
        },
        ...[
          GroupsRepository,
          KeycloakService,
          PlanRepository,
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

  it('gives a new SSO user a personal org with a credit balance', async () => {
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
        onTopBalance: 50000,
        onTopImage: 3,
      }),
    });
    expect(memberRepo.create).toHaveBeenCalledWith({
      data: { organizationId: 'org-2', userId: 'u-2', role: 'OWNER' },
    });
  });
});
