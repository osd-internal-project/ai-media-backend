import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { BrandKitService } from './brand-kit.service';
import { BrandKitDetailService } from '../brand-kit-detail/brand-kit-detail.service';

const KIT = { id: 'kit-a', organizationId: 'org-a', default: false };
const STYLE_KEY = 'organize/org-a/brand-kit/kit-a/style1.png';
const DETAIL = { id: 'd1', brandKitId: 'kit-a', type: 'colors' };

/** members: `${organizationId}:${userId}` → role */
const setup = (members: Record<string, string>) => {
  const brandKitRepo = {
    findOne: jest.fn(async ({ where }) =>
      where.id === KIT.id || where.organizationId === KIT.organizationId
        ? KIT
        : null,
    ),
    findMany: jest.fn(async (args) => args),
    create: jest.fn(async ({ data }) => data),
    update: jest.fn(async (args) => args),
    updateMany: jest.fn(async () => ({ count: 1 })),
    delete: jest.fn(async () => KIT),
  };
  const brandKitDetailRepo = {
    findOne: jest.fn(async ({ where }) => (where.id === DETAIL.id ? DETAIL : null)),
    findMany: jest.fn(async (args) => args),
    create: jest.fn(async ({ data }) => data),
    update: jest.fn(async (args) => args),
    delete: jest.fn(async () => DETAIL),
    deleteMany: jest.fn(async () => ({ count: 1 })),
  };
  const orgMemberRepo = {
    findOne: jest.fn(async ({ where }) => {
      const role = members[`${where.organizationId}:${where.userId}`];
      return role ? { role } : null;
    }),
    findMany: jest.fn(async ({ where }) =>
      Object.keys(members)
        .filter((key) => key.endsWith(`:${where.userId}`))
        .map((key) => ({ organizationId: key.split(':')[0] })),
    ),
  };
  const tx = { tx: true };
  const prisma = {
    $transaction: jest.fn(async (run) => run(tx)),
    brandKit: {
      findMany: jest.fn(async () => [
        {
          ...KIT,
          brandKitDetails: [
            { id: 'd1', type: 'colors', detail: { hex: '#D62A84' } },
            { id: 'd2', type: 'style_ref', detail: { key: STYLE_KEY } },
          ],
        },
      ]),
    },
  };
  const storageUrl = {
    toDisplayUrl: jest.fn(async (key: string) => `https://cdn/${key}`),
  };
  const kits = new BrandKitService(
    brandKitRepo as never,
    brandKitDetailRepo as never,
    orgMemberRepo as never,
    prisma as never,
    storageUrl as never,
  );
  const details = new BrandKitDetailService(brandKitDetailRepo as never, kits);
  return { kits, details, brandKitRepo, brandKitDetailRepo, tx };
};

const user = (userId: string, role: string | null = null) => ({
  userId,
  token: `sub-${userId}`,
  role,
});

const MEMBERS = {
  'org-a:owner': 'OWNER',
  'org-a:member': 'MEMBER',
  'org-b:outsider': 'OWNER',
};

describe('brand kit organization scoping', () => {
  it('rejects a request with no token user, whatever AUTH_MODE let through', async () => {
    const { kits, details } = setup(MEMBERS);
    await expect(kits.findAll(undefined)).rejects.toThrow(UnauthorizedException);
    await expect(kits.findOne(undefined, KIT.id)).rejects.toThrow(
      UnauthorizedException,
    );
    await expect(details.findOne(undefined, 'missing')).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('blocks a member of another organization from reading or changing a kit', async () => {
    const { kits, details, brandKitRepo } = setup(MEMBERS);
    const outsider = user('outsider');
    await expect(kits.findOne(outsider, KIT.id)).rejects.toThrow(
      ForbiddenException,
    );
    await expect(
      kits.update(outsider, KIT.id, { name: 'x' }),
    ).rejects.toThrow(ForbiddenException);
    await expect(kits.remove(outsider, KIT.id)).rejects.toThrow(
      ForbiddenException,
    );
    await expect(
      kits.findByOrganization(outsider, 'org-a'),
    ).rejects.toThrow(ForbiddenException);
    await expect(details.remove(outsider, DETAIL.id)).rejects.toThrow(
      ForbiddenException,
    );
    await expect(
      details.findByBrandKit(outsider, KIT.id),
    ).rejects.toThrow(ForbiddenException);
    expect(brandKitRepo.update).not.toHaveBeenCalled();
    expect(brandKitRepo.delete).not.toHaveBeenCalled();
  });

  it('lists only kits of the organizations the caller belongs to', async () => {
    const { kits } = setup(MEMBERS);
    await expect(kits.findAll(user('outsider'))).resolves.toEqual({
      where: { organizationId: { in: ['org-b'] } },
    });
  });

  it('lets a plain member read but not change', async () => {
    const { kits, details } = setup(MEMBERS);
    const member = user('member');
    await expect(kits.findOne(member, KIT.id)).resolves.toMatchObject(KIT);
    await expect(kits.setDefault(member, KIT.id)).rejects.toThrow(
      ForbiddenException,
    );
    await expect(
      details.create(member, {
        name: 'Pink',
        type: 'colors',
        brandKitId: KIT.id,
        detail: { hex: '#D62A84' },
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('lets SUPER_ADMIN act without a membership', async () => {
    const { kits } = setup(MEMBERS);
    await expect(
      kits.update(user('root', 'SUPER_ADMIN'), KIT.id, { name: 'x' }),
    ).resolves.toEqual({ where: { id: KIT.id }, data: { name: 'x' } });
  });

  it('answers 404 for a kit or detail that does not exist', async () => {
    const { kits, details } = setup(MEMBERS);
    await expect(kits.findOne(user('owner'), 'nope')).rejects.toThrow(
      NotFoundException,
    );
    await expect(details.findOne(user('owner'), 'nope')).rejects.toThrow(
      NotFoundException,
    );
  });
});

describe('brand kit default', () => {
  it('clears the old default and sets the new one in one transaction', async () => {
    const { kits, brandKitRepo, tx } = setup(MEMBERS);
    await kits.setDefault(user('owner'), KIT.id);
    expect(brandKitRepo.updateMany).toHaveBeenCalledWith(
      { where: { organizationId: 'org-a', default: true }, data: { default: false } },
      { prisma: tx },
    );
    expect(brandKitRepo.update).toHaveBeenCalledWith(
      { where: { id: KIT.id }, data: { default: true } },
      { prisma: tx },
    );
  });
});

describe('brand kit colour detail', () => {
  it('rejects a hex that is not #RGB or #RRGGBB on create and on update', async () => {
    const { details, brandKitDetailRepo } = setup(MEMBERS);
    const owner = user('owner');
    await expect(
      details.create(owner, {
        name: 'Red',
        type: 'colors',
        brandKitId: KIT.id,
        detail: { hex: 'red' },
      }),
    ).rejects.toThrow(BadRequestException);
    await expect(
      details.update(owner, DETAIL.id, { detail: { hex: 'FFF' } }),
    ).rejects.toThrow(BadRequestException);
    expect(brandKitDetailRepo.create).not.toHaveBeenCalled();
    expect(brandKitDetailRepo.update).not.toHaveBeenCalled();
  });

  it('saves a valid colour for an OWNER', async () => {
    const { details } = setup(MEMBERS);
    await expect(
      details.create(user('owner'), {
        name: 'Pink',
        type: 'colors',
        brandKitId: KIT.id,
        detail: { hex: '#D62A84', type: 'primary' },
      }),
    ).resolves.toMatchObject({ name: 'Pink', brandKitId: KIT.id });
  });

  it('keeps a short #RGB colour editable', async () => {
    const { details } = setup(MEMBERS);
    await expect(
      details.update(user('owner'), DETAIL.id, { detail: { hex: '#fff' } }),
    ).resolves.toMatchObject({ where: { id: DETAIL.id } });
  });
});

describe('brand kit images', () => {
  it('returns a display URL beside the stored key and leaves other details alone', async () => {
    const { kits } = setup(MEMBERS);
    const [kit] = await kits.findByOrganization(user('member'), 'org-a');
    expect(kit.brandKitDetails).toEqual([
      { id: 'd1', type: 'colors', detail: { hex: '#D62A84' } },
      {
        id: 'd2',
        type: 'style_ref',
        detail: { key: STYLE_KEY, url: `https://cdn/${STYLE_KEY}` },
      },
    ]);
  });

  it('saves a style image whose file is in this kit\'s folder', async () => {
    const { details } = setup(MEMBERS);
    await expect(
      details.create(user('owner'), {
        name: 'mood.png',
        type: 'style_ref',
        brandKitId: KIT.id,
        detail: { key: STYLE_KEY },
      }),
    ).resolves.toMatchObject({ type: 'style_ref', detail: { key: STYLE_KEY } });
  });

  it('refuses a file from another kit or organization, and a style image with no file', async () => {
    const { details, brandKitDetailRepo } = setup(MEMBERS);
    const owner = user('owner');
    for (const detail of [
      { key: 'organize/org-b/brand-kit/kit-a/x.png' },
      { key: 'organize/org-a/brand-kit/kit-other/x.png' },
      { key: 'organize/org-a/proj/upload/x.png' },
      {},
    ]) {
      await expect(
        details.create(owner, {
          name: 'x.png',
          type: 'style_ref',
          brandKitId: KIT.id,
          detail,
        }),
      ).rejects.toThrow(BadRequestException);
    }
    expect(brandKitDetailRepo.create).not.toHaveBeenCalled();
  });
});
