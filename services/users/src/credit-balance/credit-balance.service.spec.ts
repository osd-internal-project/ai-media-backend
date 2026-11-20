import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { CreditBalanceService } from './credit-balance.service';

const admin = { userId: 'a', token: 't', role: 'SUPER_ADMIN ' };

function setup(
  balance = { id: 'cb-1', currentCycleBalance: 0, onTopBalance: 147000, onTopImage: 0 },
  // CTD's Event: still committed 1,670 + 45,223 + 143 = 47,036
  projects = [
    { limitCreditAllowance: 150000, usedCreditAllowance: 148330 },
    { limitCreditAllowance: 100000, usedCreditAllowance: 54777 },
    { limitCreditAllowance: 100000, usedCreditAllowance: 99857 },
  ],
) {
  const row = { ...balance };
  const tx = {
    creditBalance: {
      findUnique: jest.fn(async () => row),
      update: jest.fn(async ({ data }: { data: { onTopBalance: { increment: number } } }) => {
        row.onTopBalance += data.onTopBalance.increment;
        return { ...row };
      }),
    },
    project: { findMany: jest.fn(async () => projects) },
  };
  const prisma = { $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)) };
  const service = new CreditBalanceService({} as never, prisma as never);
  return { service, tx, row };
}

describe('CreditBalanceService.updateExtraCoin', () => {
  it('lets only system admins change on-top credit', async () => {
    const { service, tx } = setup();
    await expect(
      service.updateExtraCoin('org', { onTopBalance: 100 }, { ...admin, role: 'USER' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.updateExtraCoin('org', { onTopBalance: 100 }, undefined)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(tx.creditBalance.update).not.toHaveBeenCalled();
  });

  it('adds on-top and returns what is still unassigned', async () => {
    const { service } = setup();
    const result = await service.updateExtraCoin('org', { onTopBalance: 150000 }, admin);
    expect(result.onTopBalance).toBe(297000);
    expect(result.unallocated).toBe(249964);
  });

  it('removes on-top only down to what projects were already given', async () => {
    const { service, tx } = setup();
    await expect(
      service.updateExtraCoin('org', { onTopBalance: -99965 }, admin),
    ).rejects.toThrow('Can remove at most 99964');
    expect(tx.creditBalance.update).not.toHaveBeenCalled();

    const result = await service.updateExtraCoin('org', { onTopBalance: -99964 }, admin);
    expect(result.unallocated).toBe(0);
  });

  it('never removes more than the on-top left, even when cycle credit is free', async () => {
    const { service } = setup({ id: 'cb-1', currentCycleBalance: 5000, onTopBalance: 100, onTopImage: 0 }, []);
    await expect(service.updateExtraCoin('org', { onTopBalance: -101 }, admin)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
