import { Prisma } from '@prisma/client';
import { DashboardService } from './dashboard.service';

const injection = `x' OR '1'='1`;

describe('DashboardService raw SQL', () => {
  let queryRaw: jest.Mock;
  let service: DashboardService;

  beforeEach(() => {
    queryRaw = jest.fn().mockResolvedValue([]);
    service = new DashboardService(
      {} as never,
      {} as never,
      { $queryRaw: queryRaw } as never,
      {} as never,
      {} as never,
      {} as never,
    );
  });

  const lastSql = (): Prisma.Sql => queryRaw.mock.calls[0][0];

  it('summaryOrganization binds organizationId as a parameter', async () => {
    await service.summaryOrganization(injection, {});
    expect(lastSql().sql).not.toContain(injection);
    expect(lastSql().values).toEqual([injection]);
  });

  it('summaryUser binds organizationId, projectId and month range', async () => {
    await service.summaryUser(injection, {
      projectId: `p' --`,
      createdAt: '2026-10-15',
    });
    const sql = lastSql();
    expect(sql.sql).not.toContain(injection);
    expect(sql.sql).not.toContain(`p' --`);
    expect(sql.values).toEqual([
      injection,
      injection,
      `p' --`,
      expect.stringMatching(/^2026-(09|10)-/),
      expect.stringMatching(/^2026-10-/),
    ]);
  });

  it('summaryUser omits optional filters when not given', async () => {
    await service.summaryUser('org-1', {});
    expect(lastSql().values).toEqual(['org-1', 'org-1']);
  });
});
