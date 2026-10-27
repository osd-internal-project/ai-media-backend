import { GenerateHelperService } from './generate-helper.service';

/** Redis stub with the SET … NX semantics the settlement claim relies on */
const fakeRedis = () => {
  const store = new Map<string, string>();
  return {
    store,
    set: jest.fn(async (key: string, value: string, ..._args: unknown[]) => {
      if (store.has(key)) return null;
      store.set(key, value);
      return 'OK';
    }),
    get: jest.fn(async (key: string) => store.get(key) ?? null),
    del: jest.fn(async (key: string) => Number(store.delete(key))),
  };
};

const setup = (opts: { failTransaction?: boolean } = {}) => {
  const redis = fakeRedis();
  // each tagged-template call is recorded as its SQL text (whitespace collapsed) + values
  const statements: { sql: string; values: unknown[] }[] = [];
  const prisma = {
    $executeRaw: jest.fn(async (sql: TemplateStringsArray, ...values: unknown[]) => {
      statements.push({ sql: sql.join('?').replace(/\s+/g, ' ').trim(), values });
      return 1;
    }),
    $transaction: jest.fn(async (ops: Promise<unknown>[]) => {
      if (opts.failTransaction) throw new Error('db down');
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
    expect(statements[0].values).toEqual([40, 30, 'proj', 'u1']);
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
    expect(statements[0].sql).toContain('GREATEST(hold_credit_allowance - ?, 0)');
  });

  it('a failed charge releases the claim so the task can still be refunded', async () => {
    const { service, redis } = setup({ failTransaction: true });

    await expect(
      service.updateUsedCreditSuccess('t3', 'u1', 'org', 'proj', 'credit', 30),
    ).rejects.toThrow('db down');
    expect(redis.store.has('credit:settled:t3')).toBe(false);

    await service.updateUsedCreditFail('t3', 'u1', 'org', 'proj', 'credit', 30);
    expect(redis.store.get('credit:settled:t3')).toBe('refunded');
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
