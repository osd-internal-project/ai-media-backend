import { PlanService } from './plan.service';

describe('PlanService apply to organizations', () => {
  const planBefore = { isDefault: false, accessCodes: ['image'], allowedModelIds: [] };
  const orgs = [
    { organizationId: 'follows-plan', accessCodes: ['image'], allowedModelIds: [] },
    { organizationId: 'customised', accessCodes: ['image', 'workflow'], allowedModelIds: [] },
  ];

  const setup = () => {
    const planRepo = {
      findOne: jest.fn(async () => planBefore),
      update: jest.fn(async () => ({})),
    };
    const organizationRepo = {
      findMany: jest.fn(async () => orgs),
      updatemany: jest.fn(async ({ where }) => ({ count: where.organizationId.in.length })),
    };
    const transaction = { execute: jest.fn(async (fn) => fn('tx')) };
    const auditLogRepo = { create: jest.fn() };
    const service = new PlanService(
      planRepo as never,
      {} as never,
      organizationRepo as never,
      transaction as never,
      auditLogRepo as never,
    );
    jest.spyOn(service, 'findById').mockResolvedValue({ id: 'p1' } as never);
    return { service, planRepo, organizationRepo, auditLogRepo };
  };

  const edit = { name: 'Pro', accessCodes: ['image', 'video'], allowedModelIds: [7] };

  it('changes no organization when applyToOrganizations is not sent (old clients)', async () => {
    const { service, planRepo, organizationRepo } = setup();
    const result = await service.update('p1', edit);
    expect(planRepo.update).toHaveBeenCalledTimes(1);
    expect(organizationRepo.updatemany).not.toHaveBeenCalled();
    expect(result.appliedOrganizations).toBe(0);
  });

  it('leaves prices, features and quotas alone when the body does not send them (matrix save)', async () => {
    const { service, planRepo } = setup();
    await service.update('p1', { accessCodes: ['image'], allowedModelIds: [7] });
    const { data } = (planRepo.update.mock.calls[0] as unknown as [{ data: Record<string, unknown> }])[0];
    expect(data.prices).toBeUndefined();
    expect(data.features).toBeUndefined();
    expect(data.detailJson).toBeUndefined();
    expect(data.allowedModelIds).toEqual([7]);
  });

  it('matching copies the new values only to orgs that still follow the plan', async () => {
    const { service, organizationRepo } = setup();
    const result = await service.update('p1', { ...edit, applyToOrganizations: 'matching' });
    expect(organizationRepo.updatemany).toHaveBeenCalledWith(
      {
        where: { organizationId: { in: ['follows-plan'] } },
        data: { accessCodes: ['image', 'video'], allowedModelIds: [7] },
      },
      { prisma: 'tx' },
    );
    expect(result.appliedOrganizations).toBe(1);
  });

  it('records what changed and how many orgs received it', async () => {
    const { service, auditLogRepo } = setup();
    await service.update('p1', { ...edit, applyToOrganizations: 'matching' }, { userId: 'admin-1', token: 't', role: 'SUPER_ADMIN' });
    expect(auditLogRepo.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'admin-1',
        entityName: 'plan',
        entityId: 'p1',
        oldValues: expect.objectContaining({ accessCodes: ['image'], allowedModelIds: [] }),
        newValues: expect.objectContaining({
          accessCodes: ['image', 'video'],
          allowedModelIds: [7],
          appliedOrganizations: { scope: 'matching', count: 1 },
        }),
      }),
    });
  });

  it('does not pass applyToOrganizations into the plan row', async () => {
    const { service, planRepo } = setup();
    await service.update('p1', { ...edit, applyToOrganizations: 'all' });
    const [[args]] = planRepo.update.mock.calls as unknown as [[{ data: Record<string, unknown> }]];
    expect(args.data).not.toHaveProperty('applyToOrganizations');
  });

  it('reports total, matching and customised counts for the dialog', async () => {
    const { service } = setup();
    await expect(service.organizationsImpact('p1')).resolves.toEqual({
      total: 2,
      matching: 1,
      customized: 1,
    });
  });
});

describe('PlanService create', () => {
  it('turns prices/features arrays into nested creates and drops form-only fields', async () => {
    const planRepo = { create: jest.fn(async ({ data }) => ({ id: 'new', ...data })) };
    const service = new PlanService(planRepo as never, {} as never, {} as never, {} as never, {} as never);
    await service.create({
      name: 'Pro (copy)',
      status: false,
      allowedModelIds: [3],
      popular: true,
      monthlyPrice: 990,
      prices: [{ id: 'old-price', interval: 'MONTH', price: 990 }],
      features: [{ key: 'seats', text: '5 seats', isHighlight: false }],
    });
    const { data } = planRepo.create.mock.calls[0][0];
    expect(data).toEqual(
      expect.objectContaining({
        name: 'Pro (copy)',
        status: false,
        allowedModelIds: [3],
        isPopular: true,
        prices: { create: [expect.objectContaining({ interval: 'MONTH', price: 990, currency: 'THB', orderIndex: 0 })] },
      }),
    );
    expect(data).not.toHaveProperty('monthlyPrice');
    expect(data.prices.create[0]).not.toHaveProperty('id');
    expect(data.features.create[0].feature.connectOrCreate.where).toEqual({ key: 'seats' });
  });
});
