import { resetCycleUsage, unallocatedCredit } from './credit-capacity';

describe('unallocatedCredit', () => {
  it('counts only what projects can still spend, so used on-top is not subtracted twice', () => {
    // plan 1000 + on-top 500, A limit 1500 used 1200 → cycle 0, on-top 300; then +500 on-top
    expect(
      unallocatedCredit({ currentCycleBalance: 0, onTopBalance: 800 }, [
        { limitCreditAllowance: 1500, usedCreditAllowance: 1200 },
      ]),
    ).toBe(500);
  });

  it('ignores used credit above a limit and missing rows', () => {
    expect(
      unallocatedCredit(null, [
        { limitCreditAllowance: 100, usedCreditAllowance: 130 },
        { limitCreditAllowance: null, usedCreditAllowance: null },
      ]),
    ).toBe(0);
  });

  it('is negative when an org handed out more than it holds', () => {
    expect(
      unallocatedCredit({ currentCycleBalance: 1000, onTopBalance: 300 }, [
        { limitCreditAllowance: 1500, usedCreditAllowance: 0 },
      ]),
    ).toBe(-200);
  });

  it('rounds away double precision drift', () => {
    expect(
      unallocatedCredit({ currentCycleBalance: 0.1 + 0.2, onTopBalance: 0 }, []),
    ).toBe(0.3);
  });
});

describe('resetCycleUsage', () => {
  const fakeDb = () => ({
    project: { updateMany: jest.fn() },
    projectMember: { updateMany: jest.fn() },
  });

  it('zeroes used counters of the org projects and members, never holds', async () => {
    const db = fakeDb();
    await resetCycleUsage(db as never, 'org-1', 1000);
    const data = { usedCreditAllowance: 0, usedImageAllowance: 0 };
    expect(db.projectMember.updateMany).toHaveBeenCalledWith({ where: { project: { organizationId: 'org-1' } }, data });
    expect(db.project.updateMany).toHaveBeenCalledWith({ where: { organizationId: 'org-1' }, data });
  });

  it.each([0, null, undefined])('skips orgs without a plan allowance (%s)', async (allowance) => {
    const db = fakeDb();
    await resetCycleUsage(db as never, 'org-1', allowance);
    expect(db.project.updateMany).not.toHaveBeenCalled();
    expect(db.projectMember.updateMany).not.toHaveBeenCalled();
  });
});
