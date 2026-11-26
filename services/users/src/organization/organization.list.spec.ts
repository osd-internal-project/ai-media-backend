import { Test } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
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

describe('OrganizationService.findAll (admin list)', () => {
  let service: OrganizationService;
  const organizationRepo = { findMany: jest.fn() };
  const planRepo = { findMany: jest.fn() };

  const org = (over: Record<string, unknown>) => ({
    organizationId: 'o',
    name: 'Org',
    type: 'team',
    accessCodes: ['image'],
    allowedModelIds: [],
    subscription: null,
    _count: { organizationMember: 3, invitations: 1 },
    ...over,
  });

  beforeEach(async () => {
    jest.resetAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        OrganizationService,
        { provide: OrganizationRepository, useValue: organizationRepo },
        { provide: PlanRepository, useValue: planRepo },
        { provide: HttpService, useValue: { post: jest.fn() } },
        ...[
          InvitationRepository,
          UsersRepository,
          OrganizationMemberRepository,
          CreditBalanceRepository,
          KeycloakService,
          PlanPriceRepository,
          PackageTransactionRepository,
          OrganizationSubscriptionRepository,
          LlmGatewayService,
          OrganizationSeatService,
          AuditLogRepository,
        ].map((provide) => ({ provide, useValue: {} })),
      ],
    }).compile();
    service = moduleRef.get(OrganizationService);
    planRepo.findMany.mockResolvedValue([
      { id: 'pro', name: 'Pro', isDefault: false, accessCodes: ['image', 'video'], allowedModelIds: [7] },
      { id: 'free', name: 'Free', isDefault: true, accessCodes: ['image'], allowedModelIds: [] },
    ]);
  });

  it('adds seats, plan name and the customised flag without dropping old fields', async () => {
    organizationRepo.findMany.mockResolvedValue([
      org({ organizationId: 'team-follows', subscription: { planId: 'pro', planName: 'Pro' }, accessCodes: ['video', 'image'], allowedModelIds: [7] }),
      org({ organizationId: 'team-custom', subscription: { planId: 'pro', planName: 'Pro' }, accessCodes: ['image'] }),
      org({ organizationId: 'personal', type: 'personal' }),
      org({ organizationId: 'no-plan', subscription: { planId: 'deleted', planName: 'Old plan' } }),
    ]);

    const rows = await service.findAll({});

    expect(rows.map((row) => [row.organizationId, row.planName, row.isCustomized])).toEqual([
      ['team-follows', 'Pro', false],
      ['team-custom', 'Pro', true],
      ['personal', 'Free', false],
      ['no-plan', 'Old plan', false],
    ]);
    expect(rows[0]).toMatchObject({ name: 'Org', seatUsed: 3, seatPending: 1 });
    expect(rows[0]).not.toHaveProperty('_count');
  });
});
