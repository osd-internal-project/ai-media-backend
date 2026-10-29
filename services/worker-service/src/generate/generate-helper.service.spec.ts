import { Prisma } from '@prisma/client';
import { GenerateHelperService } from './generate-helper.service';

/** Redis stub with the SET … NX semantics the settlement claim relies on */
const fakeRedis = () => {
  const store = new Map<string, string>();
  return {
    store,
    set: jest.fn(async (key: string, value: string, ...args: unknown[]) => {
      if (args.includes('NX') && store.has(key)) return null;
      store.set(key, value);
      return 'OK';
    }),
    get: jest.fn(async (key: string) => store.get(key) ?? null),
    del: jest.fn(async (key: string) => Number(store.delete(key))),
  };
};

const setup = (opts: { failTransaction?: boolean; failTimes?: number } = {}) => {
  let failuresLeft = opts.failTimes ?? 0;
  const redis = fakeRedis();
  // each tagged-template call is recorded as its SQL text (whitespace collapsed) + values
  const statements: { sql: string; values: unknown[] }[] = [];
  const prisma = {
    $executeRaw: jest.fn(async (sql: TemplateStringsArray, ...values: unknown[]) => {
      statements.push({ sql: sql.join('?').replace(/\s+/g, ' ').trim(), values });
      return 1;
    }),
    $transaction: jest.fn(async (ops: Promise<unknown>[]) => {
      if (opts.failTransaction || failuresLeft-- > 0) throw new Error('db down');
      return Promise.all(ops);
    }),
  };
  const projectMemberRepo = {
    findOne: jest.fn(async () => ({ usedCreditAllowance: 30, holdCreditAllowance: 0 })),
  };
  const service = new GenerateHelperService(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    projectMemberRepo as never,
    {} as never,
    prisma as never,
    redis as never,
  );
  return { service, redis, prisma, statements };
};

describe('GenerateHelperService credit settlement', () => {
  it('charges member, project and org in one transaction and returns the member counters', async () => {
    const { service, prisma, statements } = setup();

    const result = await service.updateUsedCreditSuccess('t1', 'u1', 'org', 'proj', 'credit', 30, 40);

    expect(result).toEqual({ usedCreditAllowance: 30, holdCreditAllowance: 0 });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(statements.map((s) => s.sql.split(' ')[1])).toEqual([
      'project_member',
      'project',
      'credit_balances',
    ]);
    // releases what core held (40), charges the real cost (30)
    expect(statements[0].values).toEqual([new Prisma.Decimal(40), new Prisma.Decimal(30), 'proj', 'u1']);
  });

  it('binds integer and fractional credit with one numeric type so a cached statement fits both', async () => {
    const { service, statements } = setup();

    await service.updateUsedCreditSuccess('t4', 'u1', 'org', 'proj', 'credit', 1807, 1807);
    await service.updateUsedCreditSuccess('t5', 'u1', 'org', 'proj', 'credit', 817.625, 812);

    const amounts = statements.flatMap((s) => s.values.filter((v) => typeof v !== 'string'));
    expect(amounts.every((v) => Prisma.Decimal.isDecimal(v))).toBe(true);
    expect(amounts.map(String)).toContain('817.625');
    // every credit placeholder carries the cast, so the server never infers the type from a value
    for (const s of statements) {
      const decimals = s.values.filter((v) => Prisma.Decimal.isDecimal(v)).length;
      expect(s.sql.split('?::numeric').length - 1).toBe(decimals);
    }
  });

  it('a retry or a fail path after success does not charge or refund again', async () => {
    const { service, statements } = setup();

    await service.updateUsedCreditSuccess('t1', 'u1', 'org', 'proj', 'credit', 30);
    await service.updateUsedCreditSuccess('t1', 'u1', 'org', 'proj', 'credit', 30);
    const afterFail = await service.updateUsedCreditFail('t1', 'u1', 'org', 'proj', 'credit', 30);

    expect(statements).toHaveLength(3);
    expect(afterFail).toEqual({ usedCreditAllowance: 30, holdCreditAllowance: 0 });
  });

  it('refunds once, floored at zero', async () => {
    const { service, statements } = setup();

    await service.updateUsedCreditFail('t2', 'u1', 'org', 'proj', 'credit', 12);
    await service.updateUsedCreditFail('t2', 'u1', 'org', 'proj', 'credit', 12);

    expect(statements).toHaveLength(1);
    expect(statements[0].sql).toContain('GREATEST(hold_credit_allowance - ?::numeric, 0)');
  });

  it('a charge that keeps failing parks the debt and keeps the hold instead of failing the task', async () => {
    const { service, redis, statements } = setup({ failTransaction: true });

    const result = await service.updateUsedCreditSuccess('t3', 'u1', 'org', 'proj', 'credit', 30, 40);

    expect(result).toEqual({ usedCreditAllowance: 30, holdCreditAllowance: 0 });
    expect(redis.store.get('credit:settled:t3')).toBe('unsettled');
    expect(JSON.parse(redis.store.get('credit:unsettled:t3') ?? '{}')).toEqual({
      taskId: 't3',
      userId: 'u1',
      organizationId: 'org',
      projectId: 'proj',
      trueAmount: 30,
      held: 40,
    });

    const before = statements.length;
    await service.updateUsedCreditFail('t3', 'u1', 'org', 'proj', 'credit', 40);
    expect(statements).toHaveLength(before);
  });

  it('a charge that fails once is retried and applied once', async () => {
    const { service, prisma, redis } = setup({ failTimes: 1 });

    await service.updateUsedCreditSuccess('t6', 'u1', 'org', 'proj', 'credit', 30);

    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
    expect(redis.store.get('credit:settled:t6')).toBe('charged');
    expect(redis.store.has('credit:unsettled:t6')).toBe(false);
  });
});

describe('GenerateHelperService.saveProviderTaskId', () => {
  const build = (fail: boolean) => {
    const gallery = { updateMany: jest.fn(async () => ({ count: 1 })) };
    const log = {
      updateMany: jest.fn(async () => {
        if (fail) throw new Error('column "provider_task_id" does not exist');
        return { count: 1 };
      }),
    };
    const service = new GenerateHelperService(
      gallery as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { log } as never,
      {} as never,
    );
    return { service, gallery, log };
  };

  it('writes the provider id to gallery and log by taskId', async () => {
    const { service, gallery, log } = build(false);
    await service.saveProviderTaskId('t1', 'cgt-1');
    const arg = { where: { taskId: 't1' }, data: { providerTaskId: 'cgt-1' } };
    expect(gallery.updateMany).toHaveBeenCalledWith(arg);
    expect(log.updateMany).toHaveBeenCalledWith(arg);
  });

  it('a DB error does not fail the generation', async () => {
    const { service } = build(true);
    await expect(service.saveProviderTaskId('t1', 'cgt-1')).resolves.toBeUndefined();
  });
});
