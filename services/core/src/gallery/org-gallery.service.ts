import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  GalleryRepository,
  MasterdataModelTypeRepository,
  OrganizationMemberRepository,
  StorageUrlService,
  buildOutputKey,
  dbValuesForKey,
  resolveGalleryResultUrls,
  toGenerationTypeKey,
} from '@ai-media/share';
import { OrgGalleryQueryDto } from './dto/org-gallery-query.dto';

const ORG_WIDE_ROLES = ['OWNER', 'ADMIN'];
const THUMBNAIL_WIDTH = 480;

/** เหตุที่กดเผยแพร่ไม่ได้ — null = เผยแพร่ได้ */
export type PublishBlock = 'NOT_OWNER' | 'MODEL_NOT_ALLOWED' | null;

const galleryInclude = Prisma.validator<Prisma.GalleryInclude>()({
  project: { select: { organizationId: true } },
  users: { select: { userId: true, fullname: true } },
  publication: { select: { id: true, status: true, visibility: true } },
});

type OrgGalleryRow = Prisma.GalleryGetPayload<{ include: typeof galleryInclude }>;

const modelNameOf = (config: Prisma.JsonValue | null): string | null => {
  if (!config || typeof config !== 'object' || Array.isArray(config)) return null;
  const name = config.modelName;
  return typeof name === 'string' ? name : null;
};

const durationOf = (config: Prisma.JsonValue | null): number | null => {
  if (!config || typeof config !== 'object' || Array.isArray(config)) return null;
  const duration = Number(config.duration);
  return Number.isFinite(duration) && duration > 0 ? duration : null;
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
   * ผลงานสำเร็จทุก project ของ org — OWNER/ADMIN เห็นทั้ง org, role อื่นเห็นเฉพาะของตัวเอง
   * @throws ForbiddenException เมื่อไม่ใช่สมาชิกของ org
   */
  async findByOrg(organizationId: string, userId: string, query: OrgGalleryQueryDto) {
    const member = await this.orgMemberRepo.findOne({
      where: { organizationId, userId },
    });
    if (!member) {
      throw new ForbiddenException('Not a member of this organization');
    }
    const orgWide = ORG_WIDE_ROLES.includes(member.role);
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 24;

    const where: Prisma.GalleryWhereInput = {
      project: { organizationId },
      // แถวเก่าบางแถวไม่มีสถานะ — เก็บไว้แบบเดียวกับ hideFailed ของ All Activity
      OR: [{ genneratedStatus: 'SUCCESS' }, { genneratedStatus: null }],
      ...(orgWide
        ? query.memberId && { userId: query.memberId }
        : { userId }),
      ...(query.type && { typeGenerate: { in: dbValuesForKey(query.type) } }),
      ...(query.publishStatus === 'NONE' && { publication: { is: null } }),
      ...(query.publishStatus &&
        query.publishStatus !== 'NONE' && {
          publication: { is: { status: query.publishStatus } },
        }),
    };

    const [rows, total] = await Promise.all([
      this.galleryRepo.findMany({
        where,
        include: galleryInclude,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        // repository รับ GalleryFindManyArgs แบบไม่ generic จึงเสีย type ของ include
      }) as Promise<OrgGalleryRow[]>,
      this.galleryRepo.count({ where }),
    ]);

    const allowedModels = await this.publishableModels(rows);
    const data = await Promise.all(
      rows.map((row) => this.toItem(organizationId, userId, row, allowedModels)),
    );
    return { data, total, page, pageSize };
  }

  private async publishableModels(rows: OrgGalleryRow[]): Promise<Set<string>> {
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
    userId: string,
    row: OrgGalleryRow,
    allowedModels: Set<string>,
  ) {
    const modelName = modelNameOf(row.generateConfig);
    const publishBlock: PublishBlock =
      row.userId !== userId
        ? 'NOT_OWNER'
        : !modelName || !allowedModels.has(modelName)
          ? 'MODEL_NOT_ALLOWED'
          : null;
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
      modelName,
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
