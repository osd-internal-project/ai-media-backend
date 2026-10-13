import { ForbiddenException } from '@nestjs/common';
import { UploadAccessService } from './upload-access.service';

const user = { userId: 'u-1', token: 'sub-1', role: 'USER' };

describe('UploadAccessService', () => {
  let orgMember: { findOne: jest.Mock };
  let project: { findOne: jest.Mock };
  let projectMember: { findOne: jest.Mock };
  let guide: { findOne: jest.Mock };
  let access: UploadAccessService;

  beforeEach(() => {
    orgMember = { findOne: jest.fn().mockResolvedValue({ role: 'MEMBER' }) };
    project = {
      findOne: jest.fn().mockResolvedValue({ id: 'p-1', organizationId: 'org-1' }),
    };
    projectMember = { findOne: jest.fn().mockResolvedValue({ role: 'USER' }) };
    guide = {
      findOne: jest.fn().mockResolvedValue({ id: 7, organizationId: 'org-1' }),
    };
    access = new UploadAccessService(
      orgMember as never,
      project as never,
      projectMember as never,
      guide as never,
    );
  });

  const forbidden = (promise: Promise<unknown>) =>
    expect(promise).rejects.toBeInstanceOf(ForbiddenException);

  it('no user (AUTH_MODE off/report without token) → not checked', async () => {
    await access.assertCanWrite(undefined, { organizationId: 'x' });
    expect(orgMember.findOne).not.toHaveBeenCalled();
  });

  it('project member of an org project may write', async () => {
    await access.assertCanWrite(user, { organizationId: 'org-1', projectId: 'p-1' });
  });

  it('not an org member → 403', async () => {
    orgMember.findOne.mockResolvedValue(null);
    await forbidden(access.assertCanWrite(user, { organizationId: 'org-1' }));
  });

  it('own org + project of another org → 403', async () => {
    project.findOne.mockResolvedValue({ id: 'p-9', organizationId: 'org-2' });
    await forbidden(
      access.assertCanWrite(user, { organizationId: 'org-1', projectId: 'p-9' }),
    );
  });

  it('org member but not in the project → 403', async () => {
    projectMember.findOne.mockResolvedValue(null);
    await forbidden(
      access.assertCanWrite(user, { organizationId: 'org-1', projectId: 'p-1' }),
    );
  });

  it('org OWNER/ADMIN reaches every project without project membership', async () => {
    orgMember.findOne.mockResolvedValue({ role: 'ADMIN' });
    projectMember.findOne.mockResolvedValue(null);
    await access.assertCanWrite(user, { organizationId: 'org-1', projectId: 'p-1' });
  });

  it('prompt guide of another org → 403', async () => {
    guide.findOne.mockResolvedValue({ id: 7, organizationId: 'org-2' });
    await forbidden(
      access.assertCanWrite(user, { organizationId: 'org-1', promptGuideId: '7' }),
    );
  });

  it('SUPER_ADMIN skips membership checks', async () => {
    orgMember.findOne.mockResolvedValue(null);
    await access.assertCanWrite(
      { ...user, role: 'SUPER_ADMIN' },
      { organizationId: 'org-1', projectId: 'p-1' },
    );
  });

  it('owner may delete their file (userId or token form)', async () => {
    await access.assertCanManageRef(user, { userId: 'u-1', projectId: 'p-1' });
    await access.assertCanManageRef(user, { userId: 'sub-1', projectId: 'p-1' });
    expect(project.findOne).not.toHaveBeenCalled();
  });

  it("deleting someone else's file needs project access", async () => {
    projectMember.findOne.mockResolvedValue(null);
    await forbidden(
      access.assertCanManageRef(user, { userId: 'u-2', projectId: 'p-1' }),
    );
  });

  it('prompt guide image of another org → 403', async () => {
    orgMember.findOne.mockResolvedValue(null);
    await forbidden(
      access.assertCanManagePromptGuideImage(user, { userId: 'u-2', promptGuideId: 7 }),
    );
  });

  it('multipart userId must belong to the token user', () => {
    expect(() => access.assertSameUser(user, 'u-2')).toThrow(ForbiddenException);
    expect(() => access.assertSameUser(user, 'sub-1')).not.toThrow();
  });
});
