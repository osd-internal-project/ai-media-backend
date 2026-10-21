import {
  BadRequestException,
  ForbiddenException,
  ValidationPipe,
} from '@nestjs/common';
import { ProjectService } from './project.service';
import { UpdateProjectDto } from './dto/update-project.dto';

type Member = {
  id: string;
  projectId: string;
  userId: string;
  role: string | null;
  limitCreditAllowance: number | null;
  limitImageAllowance: number | null;
  usedCreditAllowance: number;
  holdCreditAllowance: number;
};

const PROJECT_ID = 'p-1';
const ORG_ID = 'org-1';

function setup(members: Member[], orgRoles: Record<string, string> = { admin: 'ADMIN' }) {
  const db = {
    project: { id: PROJECT_ID, organizationId: ORG_ID, limitCreditAllowance: 40000 } as Record<string, unknown>,
    members: members.map((m) => ({ ...m })),
  };
  const tx = {
    projectMember: {
      findMany: jest.fn(async () => db.members.map((m) => ({ ...m }))),
      deleteMany: jest.fn(async ({ where }: { where: { id: { in: string[] } } }) => {
        db.members = db.members.filter((m) => !where.id.in.includes(m.id));
      }),
      update: jest.fn(async ({ where, data }: { where: { id: string }; data: Partial<Member> }) => {
        Object.assign(db.members.find((m) => m.id === where.id)!, data);
      }),
      createMany: jest.fn(async ({ data }: { data: Partial<Member>[] }) => {
        data.forEach((m, i) =>
          db.members.push({ id: `new-${i}`, usedCreditAllowance: 0, holdCreditAllowance: 0, ...m } as Member),
        );
      }),
    },
    project: {
      update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => Object.assign(db.project, data)),
    },
  };
  const users: Record<string, { userId: string; token: string; role: string | null }> = {
    admin: { userId: 'admin', token: 'sub-admin', role: 'USER' },
    member: { userId: 'member', token: 'sub-member', role: 'USER' },
    root: { userId: 'root', token: 'sub-root', role: 'SUPER_ADMIN' },
  };
  const usersRepo = {
    findOne: jest.fn(async ({ where }: { where: { OR?: { userId?: string; token?: string }[] } }) =>
      Object.values(users).find((u) =>
        where.OR?.some((c) => c.userId === u.userId || c.token === u.token),
      ) ?? null,
    ),
  };
  const projectRepo = { findOne: jest.fn(async () => ({ ...db.project })) };
  const orgMemberRepo = {
    findOne: jest.fn(async ({ where }: { where: { userId: string } }) =>
      orgRoles[where.userId] ? { role: orgRoles[where.userId] } : null,
    ),
  };
  const prisma = { $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)) };
  const service = new ProjectService(
    projectRepo as never,
    usersRepo as never,
    {} as never,
    orgMemberRepo as never,
    {} as never,
    prisma as never,
  );
  return { service, db, tx };
}

const member = (userId: string, overrides: Partial<Member> = {}): Member => ({
  id: `pm-${userId}`,
  projectId: PROJECT_ID,
  userId,
  role: 'USER',
  limitCreditAllowance: 10000,
  limitImageAllowance: 0,
  usedCreditAllowance: 0,
  holdCreditAllowance: 0,
  ...overrides,
});

describe('ProjectService.update', () => {
  it('changing member limits keeps used and hold credit (incident 2026-10-20)', async () => {
    const { service, db } = setup([
      member('me', { role: 'ADMIN', usedCreditAllowance: 7237.625, holdCreditAllowance: 40 }),
      member('user', { usedCreditAllowance: 5656.5 }),
    ]);

    await service.update(PROJECT_ID, {
      userId: 'admin',
      members: [
        { userId: 'me', role: 'ADMIN', limitCreditAllowance: 8000 },
        { userId: 'user', role: 'USER', limitCreditAllowance: 13000 },
      ],
    });

    expect(db.members).toEqual([
      member('me', { role: 'ADMIN', limitCreditAllowance: 8000, usedCreditAllowance: 7237.625, holdCreditAllowance: 40 }),
      member('user', { limitCreditAllowance: 13000, usedCreditAllowance: 5656.5 }),
    ]);
  });

  it('adds new members and removes dropped ones', async () => {
    const { service, db } = setup([member('me'), member('gone')]);

    await service.update(PROJECT_ID, {
      userId: 'admin',
      members: [{ userId: 'me', role: 'USER' }, { userId: 'fresh', limitCreditAllowance: 500 }],
    });

    expect(db.members.map((m) => [m.userId, m.role, m.limitCreditAllowance, m.usedCreditAllowance])).toEqual([
      ['me', 'USER', 10000, 0],
      ['fresh', 'USER', 500, 0],
    ]);
  });

  it.each([
    ['a limit below credit already used', [{ userId: 'me', limitCreditAllowance: 7000 }], [member('me', { usedCreditAllowance: 7237 })]],
    ['limits above the project limit', [{ userId: 'me', limitCreditAllowance: 40001 }], [member('me')]],
    ['removing a member with a generation in progress', [], [member('me', { holdCreditAllowance: 12 })]],
    ['the same member twice', [{ userId: 'me' }, { userId: 'me' }], [member('me')]],
  ])('rejects %s and writes nothing', async (_name, members, existing) => {
    const { service, db, tx } = setup(existing);

    await expect(service.update(PROJECT_ID, { userId: 'admin', members })).rejects.toBeInstanceOf(BadRequestException);

    expect(db.members).toEqual(existing);
    expect(tx.project.update).not.toHaveBeenCalled();
  });

  it('only org OWNER/ADMIN or SUPER_ADMIN may edit', async () => {
    const { service, tx } = setup([member('me')], { admin: 'ADMIN', member: 'MEMBER' });

    await expect(service.update(PROJECT_ID, { userId: 'member', name: 'x' })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.update(PROJECT_ID, { name: 'x' })).rejects.toBeInstanceOf(ForbiddenException);
    await service.update(PROJECT_ID, { userId: 'sub-admin', name: 'by token' });
    await service.update(PROJECT_ID, { name: 'by root' }, { userId: 'root', token: 'sub-root', role: 'SUPER_ADMIN' });

    expect(tx.project.update).toHaveBeenCalledTimes(2);
  });

  it('archives without touching members', async () => {
    const { service, db, tx } = setup([member('me', { usedCreditAllowance: 50 })]);

    await service.update(PROJECT_ID, { userId: 'admin', status: 'inactive' });

    expect(db.project.status).toBe('inactive');
    expect(tx.projectMember.findMany).not.toHaveBeenCalled();
  });
});

describe('UpdateProjectDto', () => {
  it('strips counters and org fields a client tries to set', async () => {
    const pipe = new ValidationPipe({ whitelist: true, transform: true });
    const body = await pipe.transform(
      {
        name: 'n',
        usedCreditAllowance: 0,
        holdCreditAllowance: 0,
        organizationId: 'other-org',
        members: [{ userId: 'me', limitCreditAllowance: 1, usedCreditAllowance: 0 }],
      },
      { type: 'body', metatype: UpdateProjectDto },
    );

    expect(body).toEqual({ name: 'n', members: [{ userId: 'me', limitCreditAllowance: 1 }] });
  });
});
