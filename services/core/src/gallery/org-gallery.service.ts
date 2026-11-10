import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  GalleryRepository,
  MasterdataModelTypeRepository,
  OrganizationMemberRepository,
  AuthUser,
  StorageUrlService,
  buildOutputKey,
  dbValuesForKey,
  resolveGalleryResultUrls,
  toGenerationTypeKey,
} from '@ai-media/share';
import { OrgGalleryQueryDto, PublishStatusFilter } from './dto/org-gallery-query.dto';

const ORG_WIDE_ROLES = ['OWNER', 'ADMIN'];
const THUMBNAIL_WIDTH = 480;

/** เหตุที่กดเผยแพร่ไม่ได้ — null = เผยแพร่ได้ */
export type PublishBlock = 'ROLE_NOT_ALLOWED' | 'MODEL_NOT_ALLOWED' | null;

const galleryInclude = Prisma.validator<Prisma.GalleryInclude>()({
  project: { select: { organizationId: true } },
  users: { select: { userId: true, fullname: true } },
  publication: { select: { id: true, status: true, visibility: true } },
});

type OrgGalleryRow = Prisma.GalleryGetPayload<{ include: typeof galleryInclude }>;

export const modelNameOf = (config: Prisma.JsonValue | null): string | null => {
  if (!config || typeof config !== 'object' || Array.isArray(config)) return null;
  const name = config.modelName;
  return typeof name === 'string' ? name : null;
};

const durationOf = (config: Prisma.JsonValue | null): number | null => {
  if (!config || typeof config !== 'object' || Array.isArray(config)) return null;
  const duration = Number(config.duration);
  return Number.isFinite(duration) && duration > 0 ? duration : null;
};

const publishStatusWhere = (status: PublishStatusFilter): Prisma.GalleryWhereInput => {
  if (status === 'NONE') return { publication: { is: null } };
  if (status === 'UNPUBLISHED') {
    return {
      OR: [{ publication: { is: null } }, { publication: { is: { status: { not: 'PUBLISHED' } } } }],
    };
  }
  return { publication: { is: { status } } };
};

@Injectable()
export class OrgGalleryService {
  constructor(
    private readonly galleryRepo: GalleryRepository,
    private readonly orgMemberRepo: OrganizationMemberRepository,
    private readonly modelTypeRepo: MasterdataModelTypeRepository,
    private readonly storageUrl: StorageUrlService,
  ) {}

  /**
   * SUPER_ADMIN หรือ OWNER/ADMIN ของ org = เห็นและเผยแพร่งานทั้ง org; role อื่นเห็นเฉพาะของตัวเองและเผยแพร่ไม่ได้
   * @throws ForbiddenException เมื่อไม่ใช่ SUPER_ADMIN และไม่ใช่สมาชิกของ org
   */
  async orgWideOrFail(organizationId: string, user: AuthUser): Promise<boolean> {
    if (user.role === 'SUPER_ADMIN') return true;
    const member = await this.orgMemberRepo.findOne({
      where: { organizationId, userId: user.userId },
    });
    if (!member) {
      throw new ForbiddenException('Not a member of this organization');
    }
    return ORG_WIDE_ROLES.includes(member.role);
  }

  /** ผลงานสำเร็จทุก project ของ org — ขอบเขตตาม orgWideOrFail */
  async findByOrg(organizationId: string, user: AuthUser, query: OrgGalleryQueryDto) {
    const orgWide = await this.orgWideOrFail(organizationId, user);
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 24;

    const base: Prisma.GalleryWhereInput = {
      project: { organizationId },
      // แถวเก่าบางแถวไม่มีสถานะ — เก็บไว้แบบเดียวกับ hideFailed ของ All Activity
      OR: [{ genneratedStatus: 'SUCCESS' }, { genneratedStatus: null }],
      ...(orgWide
        ? query.memberId && { userId: query.memberId }
        : { userId: user.userId }),
      ...(query.type && { typeGenerate: { in: dbValuesForKey(query.type) } }),
    };
    const where = query.publishStatus
      ? { AND: [base, publishStatusWhere(query.publishStatus)] }
      : base;

    const [rows, total, all, published] = await Promise.all([
      this.galleryRepo.findMany({
        where,
        include: galleryInclude,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        // repository รับ GalleryFindManyArgs แบบไม่ generic จึงเสีย type ของ include
      }) as Promise<OrgGalleryRow[]>,
      this.galleryRepo.count({ where }),
      this.galleryRepo.count({ where: base }),
      this.galleryRepo.count({ where: { AND: [base, publishStatusWhere('PUBLISHED')] } }),
    ]);

    const blocks = await this.publishBlocks(rows, orgWide);
    const data = await Promise.all(
      rows.map((row) => this.toItem(organizationId, row, blocks.get(row.id) ?? null)),
    );
    return {
      data,
      total,
      page,
      pageSize,
      counts: { all, published, unpublished: all - published },
    };
  }

  /** เหตุที่เผยแพร่แต่ละแถวไม่ได้ — กฎเดียวกับปุ่มในหน้า Gallery และ POST /community/publications */
  async publishBlocks(
    rows: Pick<OrgGalleryRow, 'id' | 'generateConfig'>[],
    canPublish: boolean,
  ): Promise<Map<string, PublishBlock>> {
    const allowedModels = await this.publishableModels(rows);
    return new Map(
      rows.map((row) => {
        const modelName = modelNameOf(row.generateConfig);
        const block: PublishBlock =
          !canPublish
            ? 'ROLE_NOT_ALLOWED'
            : !modelName || !allowedModels.has(modelName)
              ? 'MODEL_NOT_ALLOWED'
              : null;
        return [row.id, block];
      }),
    );
  }

  private async publishableModels(
    rows: Pick<OrgGalleryRow, 'generateConfig'>[],
  ): Promise<Set<string>> {
    const names = [
      ...new Set(
        rows
          .map((r) => modelNameOf(r.generateConfig))
          .filter((name): name is string => name !== null),
      ),
    ];
    if (names.length === 0) return new Set();
    const models = await this.modelTypeRepo.findMany({
      where: { modelType: { in: names }, allowPublish: true },
      select: { modelType: true },
    });
    return new Set(models.flatMap((m) => (m.modelType ? [m.modelType] : [])));
  }

  private async toItem(
    organizationId: string,
    row: OrgGalleryRow,
    publishBlock: PublishBlock,
  ) {
    const [first] = resolveGalleryResultUrls(row);
    const [mediaUrl, thumbnailUrl] = await Promise.all([
      this.storageUrl.resolveOutputUrl(organizationId, row.projectId, row.typeGenerate, first),
      this.thumbnailOf(organizationId, row, first),
    ]);
    return {
      id: row.id,
      projectId: row.projectId,
      type: toGenerationTypeKey(row.typeGenerate),
      prompt: row.prompt,
      createdAt: row.createdAt,
      creator: row.users,
      modelName: modelNameOf(row.generateConfig),
      durationSec: durationOf(row.generateConfig),
      mediaUrl,
      thumbnailUrl,
      publication: row.publication,
      publishBlock,
    };
  }

  private thumbnailOf(organizationId: string, row: OrgGalleryRow, first?: string) {
    // วิดีโอมี thumbnail ที่ worker snapshot ไว้; รูปย่อ on-the-fly จากไฟล์จริง
    if (row.thumbnailUrl) {
      return this.storageUrl.resolveOutputUrl(
        organizationId,
        row.projectId,
        row.typeGenerate,
        row.thumbnailUrl,
      );
    }
    if (first && toGenerationTypeKey(row.typeGenerate) === 'image') {
      return this.storageUrl.toThumbnailUrl(
        buildOutputKey(organizationId, row.projectId, row.typeGenerate, first),
        THUMBNAIL_WIDTH,
      );
    }
    return Promise.resolve(null);
  }
}
