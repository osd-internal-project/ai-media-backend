import { changedFields, recordAdminAudit } from './admin-audit';

describe('admin audit', () => {
  it('keeps only fields whose value really changed', () => {
    expect(
      changedFields(
        { name: 'Acme', maxUserAccess: 5, accessCodes: ['image'], allowedModelIds: null },
        { name: 'Acme', maxUserAccess: 10, accessCodes: ['image'], allowedModelIds: [7], status: undefined },
      ),
    ).toEqual({
      oldValues: { maxUserAccess: 5, allowedModelIds: null },
      newValues: { maxUserAccess: 10, allowedModelIds: [7] },
    });
  });

  it('writes nothing when nothing changed', async () => {
    const repo = { create: jest.fn() };
    await recordAdminAudit(repo as never, {
      entityName: 'plan',
      entityId: 'p1',
      oldValues: {},
      newValues: {},
    });
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('does not throw when the audit insert fails', async () => {
    const repo = { create: jest.fn().mockRejectedValue(new Error('db down')) };
    await expect(
      recordAdminAudit(repo as never, {
        userId: 'u1',
        entityName: 'organization',
        entityId: 'org-1',
        oldValues: { maxUserAccess: 5 },
        newValues: { maxUserAccess: 10 },
      }),
    ).resolves.toBeUndefined();
  });
});
