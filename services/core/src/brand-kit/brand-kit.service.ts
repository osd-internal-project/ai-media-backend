import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  AuthUser,
  BrandKitRepository,
  BrandKitDetailRepository,
  OrganizationMemberRepository,
  PrismaService,
  StorageUrlService,
  TQueryClient,
} from '@ai-media/share';
import { Prisma } from '@prisma/client';
import {
  BrandKitStyleDto,
  CreateBrandKitDto,
  UpdateBrandKitDto,
} from './dto/brand-kit.dto';

const EDITOR_ROLES = ['OWNER', 'ADMIN'];
const SUPER_ADMIN = 'SUPER_ADMIN';

export type BrandKitAccess = 'read' | 'edit';

/** The order the board shows and the composer reads: the user's drag order, then age. */
export const DETAIL_ORDER = [
  { sortOrder: 'asc' as const },
  { createdAt: 'asc' as const },
];

/** A validated style DTO as the plain JSON Prisma stores; undefined leaves the column untouched. */
const styleJson = (style?: BrandKitStyleDto): Prisma.InputJsonObject | undefined =>
  style && { ...style };

// TQueryClient does not omit `$extends`, so Prisma's transaction client needs the same cast community-post uses
const asQueryClient = (tx: unknown) => tx as TQueryClient;

@Injectable()
export class BrandKitService {
  constructor(
    private readonly brandKitRepo: BrandKitRepository,
    private readonly brandKitDetailRepo: BrandKitDetailRepository,
    private readonly orgMemberRepo: OrganizationMemberRepository,
    private readonly prisma: PrismaService,
    private readonly storageUrl: StorageUrlService,
  ) {}

  /** No token user is always a 401 here, even when AUTH_MODE=report lets the request through. */
  private requireUser(authUser?: AuthUser): AuthUser {
    if (!authUser) {
      throw new UnauthorizedException('Sign in to use brand kits');
    }
    return authUser;
  }

  /**
   * @throws UnauthorizedException when there is no token user
   * @throws ForbiddenException when the user is not an active member, or lacks OWNER/ADMIN for `edit`
   */
  async assertAccess(
    authUser: AuthUser | undefined,
    organizationId: string,
    level: BrandKitAccess,
  ): Promise<void> {
    const user = this.requireUser(authUser);
    if (user.role === SUPER_ADMIN) return;
    const member = await this.orgMemberRepo.findOne({
      where: { organizationId, userId: user.userId, status: 'active' },
    });
    if (!member) {
      throw new ForbiddenException('You are not a member of this organization');
    }
    if (level === 'edit' && !EDITOR_ROLES.includes(member.role)) {
      throw new ForbiddenException(
        'Only an organization OWNER or ADMIN can change brand kits',
      );
    }
  }

  /** Loads a kit and checks the caller against the kit's own organization. */
  async getKitFor(
    authUser: AuthUser | undefined,
    id: string,
    level: BrandKitAccess,
  ) {
    this.requireUser(authUser);
    const kit = await this.brandKitRepo.findOne({ where: { id } });
    if (!kit) throw new NotFoundException('Brand kit not found');
    await this.assertAccess(authUser, kit.organizationId, level);
    return kit;
  }

  /**
   * Gives each stored image (logo, style reference) a display URL next to its object key.
   * A logo saved before files existed keeps the data URL already in `detail.url`.
   */
  private async withImageUrls<T extends { detail: unknown }>(
    details: T[],
  ): Promise<T[]> {
    return Promise.all(
      details.map(async (item) => {
        const detail = item.detail;
        if (!detail || typeof detail !== 'object' || !('key' in detail)) {
          return item;
        }
        const key = (detail as { key?: unknown }).key;
        if (typeof key !== 'string' || !key) return item;
        // null placeholder: a missing file shows as missing, not as a stock "No Image" picture
        const url = await this.storageUrl.toDisplayUrl(key, null);
        return { ...item, detail: { ...detail, url } };
      }),
    );
  }

  /** Organizations the caller is an active member of. */
  async memberOrganizationIds(authUser: AuthUser | undefined) {
    const user = this.requireUser(authUser);
    const memberships = await this.orgMemberRepo.findMany({
      where: { userId: user.userId, status: 'active' },
      select: { organizationId: true },
    });
    return memberships.map((m) => m.organizationId);
  }

  /** Kits with their details in board order, stored images resolved to display URLs. */
  private async kitsWithDetails(where: Prisma.BrandKitWhereInput) {
    const kits = await this.prisma.brandKit.findMany({
      where,
      include: { brandKitDetails: { orderBy: DETAIL_ORDER } },
    });
    return Promise.all(
      kits.map(async (kit) => ({
        ...kit,
        brandKitDetails: await this.withImageUrls(kit.brandKitDetails),
      })),
    );
  }

  async create(authUser: AuthUser | undefined, data: CreateBrandKitDto) {
    await this.assertAccess(authUser, data.organizationId, 'edit');
    // a new kit has no saved text to preserve, so it starts on the composed prompt
    return this.brandKitRepo.create({
      data: { ...data, style: styleJson(data.style), promptVersion: 2 },
    });
  }

  async setDefault(authUser: AuthUser | undefined, id: string) {
    const kit = await this.getKitFor(authUser, id, 'edit');
    return this.prisma.$transaction(async (client) => {
      const tx = asQueryClient(client);
      await this.brandKitRepo.updateMany(
        {
          where: { organizationId: kit.organizationId, default: true },
          data: { default: false },
        },
        { prisma: tx },
      );
      return this.brandKitRepo.update(
        { where: { id }, data: { default: true } },
        { prisma: tx },
      );
    });
  }

  async findAll(authUser: AuthUser | undefined) {
    const organizationIds = await this.memberOrganizationIds(authUser);
    return this.brandKitRepo.findMany({
      where: { organizationId: { in: organizationIds } },
    });
  }

  async findOne(authUser: AuthUser | undefined, id: string) {
    await this.getKitFor(authUser, id, 'read');
    const [kit] = await this.kitsWithDetails({ id });
    return kit ?? null;
  }

  async findDefaultByOrganization(
    authUser: AuthUser | undefined,
    organizationId: string,
  ) {
    await this.assertAccess(authUser, organizationId, 'read');
    return this.brandKitRepo.findOne({
      where: { organizationId, default: true },
    });
  }

  async findByOrganization(
    authUser: AuthUser | undefined,
    organizationId: string,
  ) {
    await this.assertAccess(authUser, organizationId, 'read');
    return this.kitsWithDetails({ organizationId });
  }

  async update(
    authUser: AuthUser | undefined,
    id: string,
    data: UpdateBrandKitDto,
  ) {
    await this.getKitFor(authUser, id, 'edit');
    return this.brandKitRepo.update({
      where: { id },
      data: { ...data, style: styleJson(data.style) },
    });
  }

  async remove(authUser: AuthUser | undefined, id: string) {
    await this.getKitFor(authUser, id, 'edit');
    // FK is ON DELETE SET NULL, so details are removed here to avoid orphans
    return this.prisma.$transaction(async (client) => {
      const tx = asQueryClient(client);
      await this.brandKitDetailRepo.deleteMany(
        { where: { brandKitId: id } },
        { prisma: tx },
      );
      return this.brandKitRepo.delete({ where: { id } }, { prisma: tx });
    });
  }
}
