import { Prisma } from '@prisma/client';
import { DashboardService } from './dashboard.service';

const logRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'log-1',
  taskId: 'task-1',
  typeGenerate: 'omnihumen',
  prompt: 'say hello',
  status: 'success',
  usedCredit: 12.5,
  usedImage: null,
  createdAt: new Date('2026-10-01T00:00:00Z'),
  galleryId: 'gal-1',
  resolution: '720p',
  ratio: '16:9',
  project: { id: 'p-1', name: 'AI Expo' },
  users: { userId: 'u-1', fullname: null, username: 'tk' },
  ...overrides,
});

const setup = () => {
  const logRepo = {
    findMany: jest.fn().mockResolvedValue([logRow()]),
    count: jest.fn().mockResolvedValue(31),
  };
  const prismaService = { $queryRaw: jest.fn().mockResolvedValue([]) };
  const service = new DashboardService(
    logRepo as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    prismaService as never,
  );
  return { service, logRepo, prismaService };
};

describe('DashboardService.findGenerationSeries', () => {
  it('adds an "other" column and matches every stored spelling case-insensitively', async () => {
    const { service, prismaService } = setup();

    await service.findGenerationSeries('org-1', {
      from: '2026-08-01T00:00:00Z',
      to: '2026-10-20T00:00:00Z',
      metric: 'count',
    });

    const [strings, ...values] = prismaService.$queryRaw.mock.calls[0];
    const query = Prisma.sql(strings, ...values);
    expect(query.sql).toContain('AS "other"');
    expect(query.sql).toContain('AS "audio"');
    expect(query.sql).toContain('LOWER(l."type_generate") IN');
    expect(query.sql).toContain('l."type_generate" IS NULL OR NOT');
    expect(query.values).toEqual(
      expect.arrayContaining(['omnihumen', 'omnihuman', 'audio', 'org-1']),
    );
  });
});

describe('DashboardService.findGenerationLogs', () => {
  it('defaults to success, pages with skip/take and maps the row', async () => {
    const { service, logRepo } = setup();

    const result = await service.findGenerationLogs('org-1', {
      page: '3',
      pageSize: '20',
    });

    const args = logRepo.findMany.mock.calls[0][0];
    expect(args.where.status).toBe('success');
    expect(args.where.project).toEqual({ organizationId: 'org-1' });
    expect(args.skip).toBe(40);
    expect(args.take).toBe(20);
    expect(logRepo.count).toHaveBeenCalledWith({ where: args.where });
    expect(result).toEqual({
      data: [
        {
          id: 'log-1',
          taskId: 'task-1',
          type: 'omnihuman',
          prompt: 'say hello',
          usedCredit: 12.5,
          usedImage: 0,
          createdAt: new Date('2026-10-01T00:00:00Z'),
          projectId: 'p-1',
          projectName: 'AI Expo',
          userId: 'u-1',
          userFullname: 'tk',
          status: 'success',
          galleryId: 'gal-1',
          resolution: '720p',
          ratio: '16:9',
        },
      ],
      total: 31,
      page: 3,
      pageSize: 20,
    });
  });

  it('drops the status filter for "all" and scopes by project and user', async () => {
    const { service, logRepo } = setup();

    await service.findGenerationLogs('org-1', {
      status: 'all',
      projectId: 'p-1',
      userId: 'u-1',
      pageSize: '500',
    });

    const args = logRepo.findMany.mock.calls[0][0];
    expect(args.where).not.toHaveProperty('status');
    expect(args.where.project).toEqual({ organizationId: 'org-1', id: 'p-1' });
    expect(args.where.userId).toBe('u-1');
    expect(args.take).toBe(50);
  });

  it('filters "other" to NULL or unrecognised types', async () => {
    const { service, logRepo } = setup();

    await service.findGenerationLogs('org-1', { type: 'other' });

    const { OR } = logRepo.findMany.mock.calls[0][0].where;
    expect(OR[0]).toEqual({ typeGenerate: null });
    expect(OR[1].NOT.OR).toEqual(
      expect.arrayContaining([
        { typeGenerate: { equals: 'audio', mode: 'insensitive' } },
        { typeGenerate: { equals: 'omnihumen', mode: 'insensitive' } },
      ]),
    );
  });

  it('matches nothing for an unknown type key', async () => {
    const { service, logRepo } = setup();

    await service.findGenerationLogs('org-1', { type: 'bogus' });

    expect(logRepo.findMany.mock.calls[0][0].where.id).toEqual({ in: [] });
  });
});

describe('DashboardService.findRecentGenerations', () => {
  it('keeps the success-only set and caps the limit', async () => {
    const { service, logRepo } = setup();

    const rows = await service.findRecentGenerations('org-1', { limit: '99' });

    const args = logRepo.findMany.mock.calls[0][0];
    expect(args.where.status).toBe('success');
    expect(args.take).toBe(50);
    expect(rows[0]).not.toHaveProperty('status');
    expect(rows[0].type).toBe('omnihuman');
  });
});
