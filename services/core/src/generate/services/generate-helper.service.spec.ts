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

describe('GenerateHelperService.buildGenerateConfig reference files', () => {
  const base = {
    ratio: '16:9',
    width: 1280,
    height: 720,
    prompt: 'p',
    duration: 15,
    modelName: 'dreamina-seedance-2-5-260628',
    imageCount: 0,
    resolution: '720p',
    generateAudio: false,
  };

  it('keeps reference types and sums reference-video seconds, without urls', () => {
    const config = makeService('active').buildGenerateConfig({
      ...base,
      files: [
        { type: 'video', url: 'org/u/a.mp4', duration: 10.03 },
        { type: 'image', url: 'org/u/b.png' },
      ],
    });
    expect(config).toMatchObject({
      referenceFiles: [{ type: 'video', duration: 10.03 }, { type: 'image' }],
      inputVideoSec: 10.03,
    });
    expect(JSON.stringify(config)).not.toContain('a.mp4');
  });

  it('adds no reference keys when the request has no files', () => {
    const config = makeService('active').buildGenerateConfig(base);
    expect(config).not.toHaveProperty('referenceFiles');
    expect(config).not.toHaveProperty('inputVideoSec');
  });
});
