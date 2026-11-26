import { ForbiddenException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import {
  AuditLogRepository,
  AuthUser,
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

describe('OrganizationService.update field lock', () => {
  let service: OrganizationService;
  const organizationRepo = { update: jest.fn(), findOne: jest.fn() };
  const auditLogRepo = { create: jest.fn() };
  const original = process.env.AUTH_MODE;
  const user = (role: string): AuthUser => ({ userId: 'u1', token: 't1', role });

  beforeEach(async () => {
    jest.resetAllMocks();
    process.env.AUTH_MODE = 'report';
    const moduleRef = await Test.createTestingModule({
      providers: [
        OrganizationService,
        { provide: OrganizationRepository, useValue: organizationRepo },
        { provide: HttpService, useValue: { post: jest.fn() } },
        { provide: AuditLogRepository, useValue: auditLogRepo },
        ...[
          InvitationRepository,
          UsersRepository,
          OrganizationMemberRepository,
          CreditBalanceRepository,
          KeycloakService,
          PlanRepository,
          PlanPriceRepository,
          PackageTransactionRepository,
          OrganizationSubscriptionRepository,
          LlmGatewayService,
          OrganizationSeatService,
        ].map((provide) => ({ provide, useValue: {} })),
      ],
    }).compile();
    service = moduleRef.get(OrganizationService);
  });

  afterEach(() => {
    process.env.AUTH_MODE = original;
  });

  it('lets an owner rename the org (what /page/organization sends)', async () => {
    await service.update('org-1', { name: 'New', description: 'd' }, user('USER'));
    expect(organizationRepo.update).toHaveBeenCalledWith({
      where: { organizationId: 'org-1' },
      data: { name: 'New', description: 'd' },
    });
  });

  it('rejects a non-admin changing limit or access, naming the fields', async () => {
    await expect(
      service.update('org-1', { name: 'x', maxUserAccess: 99, accessCodes: ['image'] }, user('USER')),
    ).rejects.toThrow(new ForbiddenException('Only a system administrator can change: maxUserAccess, accessCodes'));
    expect(organizationRepo.update).not.toHaveBeenCalled();
  });

  it('lets a system admin change any field and records only what changed', async () => {
    organizationRepo.findOne.mockResolvedValue({ maxUserAccess: 5, status: false, name: 'Acme' });
    await service.update('org-1', { maxUserAccess: 99, status: false }, user('SUPER_ADMIN'));
    expect(organizationRepo.update).toHaveBeenCalledTimes(1);
    expect(auditLogRepo.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'u1',
        action: 'UPDATE',
        entityName: 'organization',
        entityId: 'org-1',
        oldValues: { maxUserAccess: 5 },
        newValues: { maxUserAccess: 99 },
      }),
    });
  });
});
