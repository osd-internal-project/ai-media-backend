import { BadRequestException } from '@nestjs/common';
import { ProjectService } from './project.service';

const KIT = '7f1c2a34-5b6d-4e8f-9a0b-1c2d3e4f5a6b';

const setup = (kitInOrg: boolean) => {
  const update = jest.fn(async (args) => args);
  const prisma = {
    brandKit: {
      findFirst: jest.fn(async () => (kitInOrg ? { id: KIT } : null)),
    },
    $transaction: jest.fn(async (run) => run({ project: { update } })),
  };
  const service = new ProjectService(
    {
      findOne: jest.fn(async () => ({
        id: 'p1',
        organizationId: 'org-a',
        limitCreditAllowance: 0,
      })),
    } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    prisma as never,
  );
  // the permission check has its own coverage; this spec is about the kit's organization
  jest
    .spyOn(
      service as unknown as { assertCanManageProject: () => Promise<void> },
      'assertCanManageProject',
    )
    .mockResolvedValue(undefined);
  return { service, prisma, update };
};

describe('ProjectService.update brand kit', () => {
  it('saves a kit that belongs to the project organization', async () => {
    const { service, prisma, update } = setup(true);
    await service.update('p1', { brandKitId: KIT });
    expect(prisma.brandKit.findFirst).toHaveBeenCalledWith({
      where: { id: KIT, organizationId: 'org-a' },
      select: { id: true },
    });
    expect(update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { brandKitId: KIT },
    });
  });

  it('refuses a kit from another organization and changes nothing', async () => {
    const { service, update } = setup(false);
    await expect(service.update('p1', { brandKitId: KIT })).rejects.toThrow(
      BadRequestException,
    );
    expect(update).not.toHaveBeenCalled();
  });

  it('clears the kit with null without looking one up', async () => {
    const { service, prisma, update } = setup(false);
    await service.update('p1', { brandKitId: null });
    expect(prisma.brandKit.findFirst).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { brandKitId: null },
    });
  });
});
