import {
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  AuthUser,
  CreditBalanceRepository,
  OrganizationMemberRepository,
  OrganizationRepository,
  OrganizationSubscriptionRepository,
  PrismaTransactionService,
  ProjectMemberRepository,
  ProjectRepository,
  RequestChangePasswordRepository,
  UsersRepository,
} from '@ai-media/share';
import { HttpService } from '@nestjs/axios';
import { of } from 'rxjs';
import { KeycloakService } from 'src/keycloak/keycloak.service';
import { OrganizationBulkMemberService } from './organization-bulk-member.service';
import { BulkMemberRowDto } from './dto/bulk-add-members.dto';

const ORG = 'org-1';
const admin: AuthUser = { userId: 'admin', token: 'kc-admin', role: 'SUPER_ADMIN ' };

const row = (overrides: Partial<BulkMemberRowDto> = {}): BulkMemberRowDto => ({
  username: 'alice',
  email: 'alice@example.com',
  fullname: 'Alice A',
  password: 'Secret123!',
  role: 'MEMBER',
  ...overrides,
});

interface FakeDb {
  org: { organizationId: string; maxUserAccess: number | null } | null;
  members: { userId: string }[];
  users: { userId: string; username: string; email: string }[];
  projects: { id: string; name: string; limitCreditAllowance: number }[];
  projectMembers: {
    projectId: string;
    userId: string;
    limitCreditAllowance: number;
  }[];
}

describe('OrganizationBulkMemberService', () => {
  let service: OrganizationBulkMemberService;
  let db: FakeDb;

  const organizationRepo = { findOne: jest.fn() };
  const memberRepo = {
    findMany: jest.fn(),
    create: jest.fn(),
    deleteMany: jest.fn(),
    updatemany: jest.fn(),
  };
  const requestChangePasswordRepo = { create: jest.fn() };
  const http = { post: jest.fn() };
  const projectRepo = { findMany: jest.fn(), create: jest.fn() };
  const projectMemberRepo = { findMany: jest.fn(), create: jest.fn() };
  const usersRepo = { findMany: jest.fn(), create: jest.fn() };
  const subscriptionRepo = { findOne: jest.fn() };
  const creditBalanceRepo = { findOne: jest.fn() };
  const keycloak = {
    findUserByUsernameOrEmail: jest.fn(),
    getPasswordPolicy: jest.fn(),
    createUser: jest.fn(),
    deleteUser: jest.fn(),
  };
  const transaction = { execute: jest.fn() };

  beforeEach(async () => {
    jest.resetAllMocks();
    db = {
      org: { organizationId: ORG, maxUserAccess: 10 },
      members: [],
      users: [],
      projects: [],
      projectMembers: [],
    };
    organizationRepo.findOne.mockImplementation(async () => db.org);
    memberRepo.findMany.mockImplementation(async () => db.members);
    usersRepo.findMany.mockImplementation(async () => db.users);
    projectRepo.findMany.mockImplementation(async ({ where }) => {
      const filter = where.AND?.[1]?.OR;
      if (!filter) return db.projects;
      const ids: string[] = filter[0].id.in;
      const names: string[] = filter[1].name.in.map((n: string) =>
        n.toLowerCase(),
      );
      return db.projects.filter(
        (p) => ids.includes(p.id) || names.includes(p.name.toLowerCase()),
      );
    });
    projectMemberRepo.findMany.mockImplementation(async ({ where }) =>
      db.projectMembers.filter((m) => where.projectId.in.includes(m.projectId)),
    );
    subscriptionRepo.findOne.mockResolvedValue({ creditAllowance: 1000 });
    creditBalanceRepo.findOne.mockResolvedValue({ onTopBalance: 0 });
    keycloak.findUserByUsernameOrEmail.mockResolvedValue([]);
    keycloak.getPasswordPolicy.mockResolvedValue('length(8) and digits(1)');
    keycloak.createUser.mockImplementation(async (u) => `kc-${u.username}`);
    usersRepo.create.mockImplementation(async ({ data }) => ({
      userId: `u-${data.username}`,
    }));
    projectRepo.create.mockImplementation(async ({ data }) => ({
      id: `p-${data.name}`,
      name: data.name,
    }));
    transaction.execute.mockImplementation(async (fn) => fn('tx'));

    const moduleRef = await Test.createTestingModule({
      providers: [
        OrganizationBulkMemberService,
        { provide: OrganizationRepository, useValue: organizationRepo },
        { provide: OrganizationMemberRepository, useValue: memberRepo },
        { provide: ProjectRepository, useValue: projectRepo },
        { provide: ProjectMemberRepository, useValue: projectMemberRepo },
        { provide: UsersRepository, useValue: usersRepo },
        {
          provide: OrganizationSubscriptionRepository,
          useValue: subscriptionRepo,
        },
        { provide: CreditBalanceRepository, useValue: creditBalanceRepo },
        { provide: KeycloakService, useValue: keycloak },
        { provide: PrismaTransactionService, useValue: transaction },
        {
          provide: RequestChangePasswordRepository,
          useValue: requestChangePasswordRepo,
        },
        { provide: HttpService, useValue: http },
      ],
    }).compile();
    service = moduleRef.get(OrganizationBulkMemberService);
  });

  const validate = (rows: BulkMemberRowDto[]) =>
    service.validate(ORG, { rows }, admin);
  const errorsOf = async (rows: BulkMemberRowDto[]) =>
    (await validate(rows)).rows.map((r) => r.errors.join(' | '));

  describe('general', () => {
    it('accepts valid new users', async () => {
      const result = await validate([
        row(),
        row({ username: 'bob', email: 'bob@example.com' }),
      ]);
      expect(result.valid).toBe(true);
      expect(result.rows.map((r) => r.status)).toEqual(['NEW_USER', 'NEW_USER']);
      expect(result.seat).toEqual({ current: 0, adding: 2, max: 10 });
    });

    it('flags usernames duplicated in the table, case-insensitively', async () => {
      const errors = await errorsOf([
        row(),
        row({ username: 'ALICE', email: 'other@example.com' }),
      ]);
      errors.forEach((e) => expect(e).toContain('Username is duplicated'));
    });

    it('flags emails duplicated in the table', async () => {
      const errors = await errorsOf([
        row(),
        row({ username: 'bob', email: 'Alice@Example.com' }),
      ]);
      errors.forEach((e) => expect(e).toContain('Email is duplicated'));
    });

    it('rejects a username that belongs to a user with another email', async () => {
      db.users = [{ userId: 'u-1', username: 'alice', email: 'x@example.com' }];
      const [error] = await errorsOf([row()]);
      expect(error).toContain('Username already belongs to another user');
    });

    it('rejects an email used by a user with another username', async () => {
      db.users = [{ userId: 'u-1', username: 'zed', email: 'alice@example.com' }];
      const [error] = await errorsOf([row()]);
      expect(error).toContain('Email is already used by another user');
    });

    it('rejects a user that exists only in Keycloak', async () => {
      keycloak.findUserByUsernameOrEmail.mockResolvedValue([{ id: 'kc-1' }]);
      const [error] = await errorsOf([row()]);
      expect(error).toContain('exists in Keycloak');
    });

    it('validates format per row instead of failing the request', async () => {
      const errors = await errorsOf([
        row({ username: 'a', email: 'bad', role: 'BOSS' }),
      ]);
      expect(errors[0]).toContain('Username must be');
      expect(errors[0]).toContain('Email is invalid');
      expect(errors[0]).toContain('Role must be one of');
    });
  });

  describe('organization membership', () => {
    beforeEach(() => {
      db.users = [{ userId: 'u-1', username: 'alice', email: 'alice@example.com' }];
    });

    it('treats a matching user as EXISTING_USER without needing a password', async () => {
      const result = await validate([row({ password: '' })]);
      expect(result.rows[0].status).toBe('EXISTING_USER');
      expect(keycloak.findUserByUsernameOrEmail).not.toHaveBeenCalled();
    });

    it('rejects an existing org member when no project is given', async () => {
      db.members = [{ userId: 'u-1' }];
      const [error] = await errorsOf([row()]);
      expect(error).toContain('Already a member of this organization');
    });

    it('allows an existing org member to be added to a project', async () => {
      db.members = [{ userId: 'u-1' }];
      db.projects = [{ id: 'p-1', name: 'Alpha', limitCreditAllowance: 100 }];
      const result = await validate([row({ projectId: 'p-1' })]);
      expect(result.valid).toBe(true);
      expect(result.seat.adding).toBe(0);
    });
  });

  describe('seats', () => {
    it('blocks the batch when seats are exceeded', async () => {
      db.org.maxUserAccess = 1;
      db.members = [{ userId: 'u-x' }];
      const result = await validate([row()]);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('Seat limit exceeded');
    });

    it('treats a null maxUserAccess as unlimited', async () => {
      db.org.maxUserAccess = null;
      db.members = Array.from({ length: 50 }, (_, i) => ({ userId: `m-${i}` }));
      const result = await validate([row()]);
      expect(result.valid).toBe(true);
    });
  });

  describe('passwords', () => {
    it('rejects a password that fails the policy', async () => {
      const [error] = await errorsOf([row({ password: 'short' })]);
      expect(error).toContain('at least 8 characters');
    });

    it('requires a password for a new user', async () => {
      const [error] = await errorsOf([row({ password: '' })]);
      expect(error).toContain('Password is required');
    });
  });

  describe('projects', () => {
    beforeEach(() => {
      db.projects = [{ id: 'p-1', name: 'Alpha', limitCreditAllowance: 100 }];
    });

    it('rejects a row with both projectId and projectName', async () => {
      const [error] = await errorsOf([
        row({ projectId: 'p-1', projectName: 'Beta' }),
      ]);
      expect(error).toContain('not both');
    });

    it('rejects a projectId that is not in this organization', async () => {
      const [error] = await errorsOf([row({ projectId: 'p-other' })]);
      expect(error).toContain('Project not found');
    });

    it('rejects a new projectName that matches an existing project', async () => {
      const [error] = await errorsOf([row({ projectName: 'alpha' })]);
      expect(error).toContain('already exists');
    });

    it('rejects a user who is already a project member', async () => {
      db.users = [{ userId: 'u-1', username: 'alice', email: 'alice@example.com' }];
      db.members = [{ userId: 'u-1' }];
      db.projectMembers = [
        { projectId: 'p-1', userId: 'u-1', limitCreditAllowance: 0 },
      ];
      const [error] = await errorsOf([row({ projectId: 'p-1' })]);
      expect(error).toContain('Already a member of this project');
    });

    it('rejects credit without a project', async () => {
      const [error] = await errorsOf([row({ credit: 10 })]);
      expect(error).toContain('Credit requires a project');
    });
  });

  describe('credit', () => {
    beforeEach(() => {
      db.projects = [{ id: 'p-1', name: 'Alpha', limitCreditAllowance: 100 }];
      db.projectMembers = [
        { projectId: 'p-1', userId: 'u-x', limitCreditAllowance: 60 },
      ];
    });

    it('rejects credit beyond an existing project limit', async () => {
      const [error] = await errorsOf([row({ projectId: 'p-1', credit: 50 })]);
      expect(error).toContain('60 assigned + 50 importing > 100');
    });

    it('sums credit of all rows into the new project limit', async () => {
      const result = await validate([
        row({ projectName: 'Beta', credit: 100 }),
        row({
          username: 'bob',
          email: 'bob@example.com',
          projectName: 'beta',
          credit: 50,
        }),
      ]);
      expect(result.valid).toBe(true);
      expect(result.credit.newProjects).toEqual([
        { name: 'Beta', limitCreditAllowance: 150 },
      ]);
    });

    it('rejects new projects that need more credit than the org has left', async () => {
      // pool 1000 − 100 already given to Alpha = 900 remaining
      const result = await validate([row({ projectName: 'Beta', credit: 901 })]);
      expect(result.credit.orgRemaining).toBe(900);
      expect(result.rows[0].errors.join()).toContain('900 remaining');
    });

    it('counts cycle balance granted outside the plan (event org)', async () => {
      subscriptionRepo.findOne.mockResolvedValue({ creditAllowance: 0 });
      creditBalanceRepo.findOne.mockResolvedValue({
        currentCycleBalance: 5000,
        onTopBalance: 0,
      });
      const result = await validate([row({ projectName: 'Beta', credit: 4900 })]);
      expect(result.credit.orgRemaining).toBe(4900);
      expect(result.valid).toBe(true);
    });
  });

  describe('permissions', () => {
    it('forbids a non super admin', async () => {
      await expect(
        service.validate(ORG, { rows: [row()] }, { ...admin, role: 'USER' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('rejects a request without an authenticated user', async () => {
      await expect(
        service.validate(ORG, { rows: [row()] }, undefined),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('createChunk', () => {
    const chunk = (rows: BulkMemberRowDto[], newProjects = []) => ({
      rows: rows.map((r, rowIndex) => ({ ...r, rowIndex })),
      newProjects,
    });

    it('writes nothing when any row is invalid', async () => {
      await expect(
        service.createChunk(
          ORG,
          chunk([row(), row({ username: 'bob', email: 'bad' })]),
          admin,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(keycloak.createUser).not.toHaveBeenCalled();
      expect(usersRepo.create).not.toHaveBeenCalled();
      expect(projectRepo.create).not.toHaveBeenCalled();
    });

    it('creates the Keycloak user, user, org member and project member', async () => {
      db.projects = [{ id: 'p-1', name: 'Alpha', limitCreditAllowance: 100 }];
      const result = await service.createChunk(
        ORG,
        chunk([row({ projectId: 'p-1', credit: 40, projectRole: 'viewer' })]),
        admin,
      );
      expect(result.results).toEqual([
        { rowIndex: 0, status: 'NEW_USER', errors: [] },
      ]);
      expect(usersRepo.create.mock.calls[0][0].data).toMatchObject({
        username: 'alice',
        token: 'kc-alice',
        recentOrganizationId: ORG,
      });
      expect(memberRepo.create.mock.calls[0][0].data).toMatchObject({
        organizationId: ORG,
        userId: 'u-alice',
        role: 'MEMBER',
      });
      expect(projectMemberRepo.create.mock.calls[0][0].data).toEqual({
        projectId: 'p-1',
        userId: 'u-alice',
        role: 'VIEWER',
        limitCreditAllowance: 40,
      });
    });

    it('rolls back the Keycloak user when the database write fails', async () => {
      transaction.execute.mockRejectedValue(new Error('db down'));
      const result = await service.createChunk(ORG, chunk([row()]), admin);
      expect(result.results[0]).toEqual({
        rowIndex: 0,
        status: 'ERROR',
        errors: ['db down'],
      });
      expect(keycloak.deleteUser).toHaveBeenCalledWith('kc-alice');
    });

    it('creates a new project once and returns its id', async () => {
      const result = await service.createChunk(
        ORG,
        chunk(
          [
            row({ projectName: 'Beta', credit: 10 }),
            row({
              username: 'bob',
              email: 'bob@example.com',
              projectName: 'beta',
              credit: 20,
            }),
          ],
          [{ name: 'Beta', limitCreditAllowance: 80 }],
        ),
        admin,
      );
      expect(projectRepo.create).toHaveBeenCalledTimes(1);
      expect(projectRepo.create.mock.calls[0][0].data).toMatchObject({
        name: 'Beta',
        organizationId: ORG,
        limitCreditAllowance: 80,
      });
      expect(result.createdProjects).toEqual([{ name: 'Beta', id: 'p-Beta' }]);
      expect(
        projectMemberRepo.create.mock.calls.map((c) => c[0].data.projectId),
      ).toEqual(['p-Beta', 'p-Beta']);
    });

    it('only adds the org membership for an existing user', async () => {
      db.users = [{ userId: 'u-1', username: 'alice', email: 'alice@example.com' }];
      const result = await service.createChunk(
        ORG,
        chunk([row({ password: '' })]),
        admin,
      );
      expect(result.results[0].status).toBe('EXISTING_USER');
      expect(keycloak.createUser).not.toHaveBeenCalled();
      expect(usersRepo.create).not.toHaveBeenCalled();
      expect(memberRepo.create.mock.calls[0][0].data.userId).toBe('u-1');
    });
  });
  describe('member actions', () => {
    const scoped = {
      organizationId: ORG,
      id: { in: [1, 2, 3] },
      role: { not: 'OWNER' },
    };

    it('removes only non-owner members of this org', async () => {
      memberRepo.deleteMany.mockResolvedValue({ count: 2 });
      const result = await service.removeMembers(ORG, [1, 2, 3], admin);
      expect(memberRepo.deleteMany).toHaveBeenCalledWith({ where: scoped });
      expect(result).toEqual({ removed: 2, skipped: 1 });
    });

    it('sets the per-org status without touching Keycloak', async () => {
      memberRepo.updatemany.mockResolvedValue({ count: 3 });
      const result = await service.setMembersStatus(
        ORG,
        [1, 2, 3],
        'inactive',
        admin,
      );
      expect(memberRepo.updatemany).toHaveBeenCalledWith({
        where: scoped,
        data: { status: 'inactive' },
      });
      expect(keycloak.createUser).not.toHaveBeenCalled();
      expect(result).toEqual({ updated: 3, skipped: 0 });
    });

    it('rejects non-admins', async () => {
      const member: AuthUser = { userId: 'u', token: 't', role: 'USER' };
      await expect(service.removeMembers(ORG, [1], member)).rejects.toThrow(
        ForbiddenException,
      );
      expect(memberRepo.deleteMany).not.toHaveBeenCalled();
    });

    it('counts access emails the email-api did not send as failed', async () => {
      db.org = { organizationId: ORG, maxUserAccess: 10, name: 'Team' } as FakeDb['org'];
      memberRepo.findMany.mockResolvedValue([{ userId: 'u-a' }, { userId: 'u-b' }]);
      usersRepo.findMany.mockResolvedValue([
        { username: 'alice', email: 'alice@example.com' },
        { username: 'bob', email: 'bob@example.com' },
      ]);
      http.post
        .mockReturnValueOnce(of({ data: { success: true } }))
        .mockReturnValueOnce(of({ data: { success: false, error: 'SMTP down' } }));

      const result = await service.sendAccessEmails(ORG, [1, 2, 3], admin);

      expect(result).toEqual({
        sent: 1,
        skipped: 1,
        failed: [{ email: 'bob@example.com', reason: 'SMTP down' }],
      });
      expect(requestChangePasswordRepo.create).toHaveBeenCalledTimes(2);
      expect(http.post.mock.calls[0][1]).toMatchObject({
        to: 'alice@example.com',
        template: 'account-access',
        context: {
          teamName: 'Team',
          username: 'alice',
          login_url: expect.stringMatching(/\/login$/),
        },
      });
    });
  });
});
