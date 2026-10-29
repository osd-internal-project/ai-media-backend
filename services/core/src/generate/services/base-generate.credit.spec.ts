import { GenerateImageService } from './generate-image.service';

const body = {
  taskId: 't1',
  userId: 'sub-token',
  organizationId: 'org',
  projectId: 'proj',
  prompt: 'p',
  model: 'm',
  ratio: '1:1',
  resolution: '2k',
  width: 2048,
  height: 2048,
  maxImages: 1,
  image: [],
};
const member = { limitCreditAllowance: 100, usedCreditAllowance: 50, holdCreditAllowance: 10 };

const setup = (
  opts: {
    available?: { project: number; organization: number };
    reserved?: boolean;
    failAt?: 'gallery' | 'afterQueue';
    projectOrg?: string;
  } = {},
) => {
  const helper = {
    validateUserAndProject: jest.fn(async () => ({
      user: { userId: 'u1' },
      projectMember: member,
      organizationId: opts.projectOrg ?? 'org',
    })),
    logAudit: jest.fn(),
    getUsedCredit: jest.fn(async () => ({ token: 0, credit: 20 })),
    getAvailableCredit: jest.fn(async () => opts.available ?? { project: 1000, organization: 1000 }),
    reserveHold: jest.fn(async () => opts.reserved ?? true),
    cancelHoldAmount: jest.fn(),
    handleGenerationError: jest.fn(),
    buildGenerateConfig: jest.fn(() => ({})),
    collectReferenceKeys: jest.fn(() => []),
    toReferenceDisplayUrls: jest.fn(async () => []),
  };
  const galleryRepo = {
    create: jest.fn(async () => {
      if (opts.failAt === 'gallery') throw new Error('gallery insert failed');
      return { id: 'g1' };
    }),
  };
  let queued = false;
  const redis = {
    set: jest.fn(async (key: string) => {
      if (opts.failAt === 'afterQueue' && queued && key.startsWith('task:')) {
        throw new Error('redis down');
      }
      return 'OK';
    }),
  };
  const queue = {
    add: jest.fn(async () => {
      queued = true;
      return { id: 'j1' };
    }),
  };
  const service = new GenerateImageService(
    helper as never,
    galleryRepo as never,
    { create: jest.fn() } as never,
    { findOne: jest.fn(async () => ({ modelType: 'm' })) } as never,
    redis as never,
    queue as never,
    {} as never,
    { getOrCreateApiKey: jest.fn(async () => 'key') } as never,
  );
  return { service, helper, queue };
};

describe('generation credit check + hold', () => {
  it('reserves the hold on the real user id (body.userId is the Keycloak token)', async () => {
    const { service, helper } = setup();

    const res = await service.createGenerationTask(body, 'c1');

    expect(res.status).toBe(200);
    expect(helper.reserveHold).toHaveBeenCalledWith('u1', 'proj', 20);
    expect(helper.cancelHoldAmount).not.toHaveBeenCalled();
  });

  it.each([
    ['project', { project: 19, organization: 1000 }, true, 'Project credit remaining 19 is not enough for 20'],
    ['organization', { project: 1000, organization: 5 }, true, 'Organization credit remaining 5 is not enough for 20'],
    ['member', { project: 1000, organization: 1000 }, false, 'Token used 80 exceed max credit 100'],
  ])('refuses when the %s has no room, without queueing', async (_level, available, reserved, message) => {
    const { service, queue } = setup({ available, reserved });

    const res = await service.createGenerationTask(body, 'c1');

    expect(res).toEqual({ status: 400, data: message });
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('refuses a project from another org than the one selected, before holding credit', async () => {
    const { service, helper, queue } = setup({ projectOrg: 'other-org' });

    const res = await service.createGenerationTask(body, 'c1');

    expect(res).toEqual({
      status: 400,
      data: 'Project does not belong to the selected organization, please reload',
    });
    expect(helper.reserveHold).not.toHaveBeenCalled();
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('releases the hold when the task fails before it is queued', async () => {
    const { service, helper } = setup({ failAt: 'gallery' });

    await expect(service.createGenerationTask(body, 'c1')).rejects.toThrow('gallery insert failed');

    expect(helper.cancelHoldAmount).toHaveBeenCalledWith(20, 'u1', 'proj');
  });

  it('keeps the hold when a step after queueing fails — the worker settles it', async () => {
    const { service, helper } = setup({ failAt: 'afterQueue' });

    await expect(service.createGenerationTask(body, 'c1')).rejects.toThrow('redis down');

    expect(helper.cancelHoldAmount).not.toHaveBeenCalled();
  });
});
