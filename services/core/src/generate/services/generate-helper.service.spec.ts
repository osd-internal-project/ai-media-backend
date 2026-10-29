import { GenerateHelperService } from './generate-helper.service';

type MemberWhere = {
  projectId: string;
  userId: string;
  users?: {
    organizationMembers: {
      none: { organizationId: string; status: string };
    };
  };
};

/** fake DB ที่ตีความ where ของ projectMember แบบเดียวกับ Prisma (เฉพาะ field ที่ใช้) */
const makeService = (orgMemberStatus: 'active' | 'inactive') => {
  const projectMember = { projectId: 'proj', userId: 'u-1', role: 'USER' };
  const orgMember = { organizationId: 'org-1', status: orgMemberStatus };
  const projectMemberRepo = {
    findOne: jest.fn(async ({ where }: { where: MemberWhere }) => {
      const excluded = where.users?.organizationMembers.none;
      const blocked =
        excluded &&
        excluded.organizationId === orgMember.organizationId &&
        excluded.status === orgMember.status;
      return blocked ? null : projectMember;
    }),
  };
  const service = new GenerateHelperService(
    { findOne: jest.fn(async () => ({ userId: 'u-1' })) } as never,
    projectMemberRepo as never,
    { findOne: jest.fn(async () => ({ organizationId: 'org-1' })) } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
  return service;
};

describe('GenerateHelperService.validateUserAndProject', () => {
  it('returns the project member while the org membership is active', async () => {
    const { projectMember } = await makeService('active').validateUserAndProject(
      'kc-1',
      'proj',
    );
    expect(projectMember).not.toBeNull();
  });

  it('treats a member disabled in the project org as not a member', async () => {
    const { projectMember } = await makeService('inactive').validateUserAndProject(
      'kc-1',
      'proj',
    );
    expect(projectMember).toBeNull();
  });
});

describe('GenerateHelperService project org + error labels', () => {
  it("returns the project's organization so the caller can check the selected org", async () => {
    const { organizationId } = await makeService('active').validateUserAndProject(
      'kc-1',
      'proj',
    );
    expect(organizationId).toBe('org-1');
  });

  it('names the generation type in the error, not always image', () => {
    expect(() =>
      makeService('active').handleGenerationError(new Error('db down'), 'u-1', 'video'),
    ).toThrow('Failed to generate video');
  });
});
