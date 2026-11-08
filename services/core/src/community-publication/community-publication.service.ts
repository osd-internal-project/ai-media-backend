import {
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import {
  CommunityPublication,
  CommunityPublicationStatus,
  Gallery,
  Prisma,
} from '@prisma/client';
import { extname } from 'path';
import {
  AuthUser,
  CommunityPublicationRepository,
  GalleryRepository,
  OrganizationMemberRepository,
  OrganizationRepository,
  StorageUrlService,
  TosService,
  UsersRepository,
  buildCommunityPreviewKey,
  buildOutputKey,
  isAbsoluteUrl,
  resolveGalleryResultUrls,
  toGenerationTypeKey,
} from '@ai-media/share';
import { communityConfigs, tosConfigs } from '../configs';
import { modelNameOf, OrgGalleryService, PublishBlock } from '../gallery/org-gallery.service';
import {
  ListPublicPublicationsQueryDto,
  PublishToCommunityDto,
} from './dto/community-publication.dto';

const { PENDING, PUBLISHED, REMOVED, FAILED } = CommunityPublicationStatus;
const MANAGE_ROLES = ['OWNER', 'ADMIN'];
const PREVIEW_THUMBNAIL_WIDTH = 480;
/** สถานะที่ยังเปิดไฟล์ preview ได้ — PENDING คือกำลัง copy หรือแถวเก่าก่อนเลิก webhook */
const SERVABLE: CommunityPublicationStatus[] = [PENDING, PUBLISHED];

/** สำเนาใน `community-publication/` — ไม่ใช่ไฟล์ต้นฉบับ */
export interface PreviewItem {
  key: string;
  thumbnailKey: string | null;
  typeGenerate: string;
  order: number;
}

export type PublishSkipReason = Exclude<PublishBlock, null> | 'NOT_FOUND';
export type PublishResult =
  | {
      galleryId: string;
      publicationId: string;
      status: typeof CommunityPublicationStatus.PUBLISHED;
    }
  | {
      galleryId: string;
      publicationId: string;
      status: typeof CommunityPublicationStatus.FAILED;
      error: string;
    }
  | { galleryId: string; status: 'SKIPPED'; reason: PublishSkipReason };

type PublishRow = Gallery;

const feedInclude = Prisma.validator<Prisma.CommunityPublicationInclude>()({
  gallery: { select: { prompt: true, generateConfig: true } },
});
type FeedRow = Prisma.CommunityPublicationGetPayload<{ include: typeof feedInclude }>;
const FEED_DEFAULT_TAKE = 50;

export interface PublicationMedia {
  type: string;
  url: string;
  thumbnailUrl: string | null;
}

export interface PublicPublication {
  id: string;
  organizationId: string;
  organizationName: string | null;
  type: string | null;
  modelName: string | null;
  prompt: string | null;
  media: PublicationMedia[];
  publishedAt: Date | null;
  updatedAt: Date;
}

const isPreviewItem = (value: unknown): value is PreviewItem =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as PreviewItem).key === 'string' &&
  typeof (value as PreviewItem).order === 'number';

export const readPreviewItems = (value: Prisma.JsonValue): PreviewItem[] => {
  const list: unknown[] = Array.isArray(value) ? value : [];
  return list.filter(isPreviewItem).sort((a, b) => a.order - b.order);
};

@Injectable()
export class CommunityPublicationService {
  private readonly logger = new Logger(CommunityPublicationService.name);
  private readonly bucket = tosConfigs().tosBucket ?? '';

  constructor(
    private readonly publicationRepo: CommunityPublicationRepository,
    private readonly galleryRepo: GalleryRepository,
    private readonly orgMemberRepo: OrganizationMemberRepository,
    private readonly orgRepo: OrganizationRepository,
    private readonly usersRepo: UsersRepository,
    private readonly orgGallery: OrgGalleryService,
    private readonly storageUrl: StorageUrlService,
    private readonly tos: TosService,
    @Inject(communityConfigs.KEY)
    private readonly config: ConfigType<typeof communityConfigs>,
  ) {}

  /**
   * เผยแพร่งานของตัวเองทีละชิ้น (copy ลง community-publication/ แล้ว PUBLISHED ทันที Community มาดึงเอง)
   * ชิ้นที่ไม่ผ่านกฎถูกข้ามพร้อมเหตุผล ไม่ล้มทั้งชุด
   * กดซ้ำใช้แถวเดิม (galleryId unique) และ copy ทับ key เดิม
   */
  async publish(user: AuthUser, dto: PublishToCommunityDto): Promise<PublishResult[]> {
    await this.memberRoleOrFail(dto.organizationId, user.userId);
    const rows = await this.galleryRepo.findMany({
      where: {
        id: { in: dto.galleryIds },
        project: { organizationId: dto.organizationId },
        OR: [{ genneratedStatus: 'SUCCESS' }, { genneratedStatus: null }],
      },
    });
    const byId = new Map(rows.map((row) => [row.id, row]));
    const blocks = await this.orgGallery.publishBlocks(rows, user.userId);

    const results: PublishResult[] = [];
    // ทีละชิ้น: แต่ละชิ้น copy หลายไฟล์บน TOS อยู่แล้ว
    for (const galleryId of [...new Set(dto.galleryIds)]) {
      const row = byId.get(galleryId);
      const block = blocks.get(galleryId) ?? null;
      if (!row) results.push({ galleryId, status: 'SKIPPED', reason: 'NOT_FOUND' });
      else if (block) results.push({ galleryId, status: 'SKIPPED', reason: block });
      else results.push(await this.publishOne(row, dto));
    }
    return results;
  }

  /** ถอดจาก feed — เจ้าของงาน หรือ OWNER/ADMIN ของ org */
  async unpublish(user: AuthUser, id: string): Promise<CommunityPublication> {
    const publication = await this.publicationRepo.findOne({ where: { id } });
    if (!publication) throw new NotFoundException('Publication not found');
    if (publication.userId !== user.userId && user.role !== 'SUPER_ADMIN') {
      const role = await this.memberRoleOrFail(publication.organizationId, user.userId);
      if (!MANAGE_ROLES.includes(role)) {
        throw new ForbiddenException('Only the creator or an org admin can remove this');
      }
    }
    if (publication.status === REMOVED) return publication;

    await this.deletePreviews(readPreviewItems(publication.previewItems));
    return this.publicationRepo.update({
      where: { id },
      data: { status: REMOVED, previewItems: [] },
    });
  }

  /** URL ชั่วคราวของไฟล์ preview — route public redirect ไปที่นี่ */
  async resolvePreviewUrl(id: string, index: number, thumbnail: boolean): Promise<string> {
    const publication = await this.publicationRepo.findOne({
      where: { id, status: { in: SERVABLE } },
    });
    const item = publication && readPreviewItems(publication.previewItems)[index];
    if (!item) throw new NotFoundException('Media not found');

    const url = !thumbnail
      ? await this.storageUrl.toDisplayUrl(item.key, null)
      : item.thumbnailKey
        ? await this.storageUrl.toDisplayUrl(item.thumbnailKey, null)
        : toGenerationTypeKey(item.typeGenerate) === 'image'
          ? await this.storageUrl.toThumbnailUrl(item.key, PREVIEW_THUMBNAIL_WIDTH)
          : null;
    if (!url) throw new NotFoundException('Media not found');
    return url;
  }

  /** งาน PUBLISHED + PUBLIC (ทุก org หรือ org เดียว) ใหม่สุดก่อน — คืนเป็น link คงที่ ไม่ใช่ไฟล์ */
  async listPublic(
    query: ListPublicPublicationsQueryDto,
  ): Promise<{ items: PublicPublication[]; total: number; take: number; skip: number }> {
    const take = query.take ?? FEED_DEFAULT_TAKE;
    const skip = query.skip ?? 0;
    const where: Prisma.CommunityPublicationWhereInput = {
      status: PUBLISHED,
      visibility: 'PUBLIC',
      ...(query.organizationId && { organizationId: query.organizationId }),
      ...(query.updatedSince && { updatedAt: { gte: new Date(query.updatedSince) } }),
    };
    const [rows, total] = await Promise.all([
      this.publicationRepo.findMany({
        where,
        include: feedInclude,
        orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
        take,
        skip,
        // repository รับ FindManyArgs แบบไม่ generic จึงเสีย type ของ include
      }) as Promise<FeedRow[]>,
      this.publicationRepo.count({ where }),
    ]);
    const orgNames = await this.orgNames(rows.map((row) => row.organizationId));
    return {
      items: rows.map((row) => this.toPublicPublication(row, orgNames.get(row.organizationId) ?? null)),
      total,
      take,
      skip,
    };
  }

  /** Community เรียกด้วย token ของ user เอง — คืนตัวตน creator และ org ที่สังกัด */
  async link(user: AuthUser) {
    const row = await this.usersRepo.findOne({
      where: { userId: user.userId },
      select: { userId: true, token: true, fullname: true, email: true, communityLinkedAt: true },
    });
    if (!row) throw new NotFoundException('User not found');
    const linkedAt =
      row.communityLinkedAt ??
      (
        await this.usersRepo.update({
          where: { userId: user.userId },
          data: { communityLinkedAt: new Date() },
        })
      ).communityLinkedAt;
    const memberships = await this.orgMemberRepo.findMany({
      where: { userId: user.userId },
      include: { organization: { select: { organizationId: true, name: true } } },
    });
    return {
      userId: row.userId,
      keycloakSub: row.token,
      fullname: row.fullname,
      email: row.email,
      linkedAt,
      organizations: memberships.map((m) => ({
        organizationId: m.organizationId,
        // include ของ repository ไม่ generic — organization มีเสมอเพราะ FK บังคับ
        name: (m as typeof m & { organization: { name: string } }).organization.name,
        role: m.role,
      })),
    };
  }

  private async publishOne(row: PublishRow, dto: PublishToCommunityDto): Promise<PublishResult> {
    const organizationId = dto.organizationId;
    const publication = await this.publicationRepo.upsert({
      where: { galleryId: row.id },
      create: {
        galleryId: row.id,
        organizationId,
        userId: row.userId,
        visibility: dto.visibility,
        includePrompt: dto.includePrompt,
      },
      update: {
        visibility: dto.visibility,
        includePrompt: dto.includePrompt,
        status: PENDING,
        error: null,
      },
    });

    try {
      const previewItems = await this.copyPreviews(organizationId, publication.id, row);
      await this.publicationRepo.update({
        where: { id: publication.id },
        // interface ไม่มี index signature จึงไม่เข้ากับ InputJsonValue ทั้งที่เป็น JSON ล้วน
        data: {
          previewItems: previewItems as unknown as Prisma.InputJsonValue,
          status: PUBLISHED,
          publishedAt: new Date(),
        },
      });
      return { galleryId: row.id, publicationId: publication.id, status: PUBLISHED };
    } catch (error) {
      const message = describe(error);
      this.logger.error(`publish ${publication.id} failed: ${message}`);
      await this.publicationRepo.update({
        where: { id: publication.id },
        data: { status: FAILED, error: message },
      });
      return { galleryId: row.id, publicationId: publication.id, status: FAILED, error: message };
    }
  }

  private async copyPreviews(
    organizationId: string,
    publicationId: string,
    row: PublishRow,
  ): Promise<PreviewItem[]> {
    const typeGenerate = row.typeGenerate ?? 'image';
    const sourceKey = (name: string) => {
      if (isAbsoluteUrl(name)) throw new Error(`legacy file URL cannot be copied: ${row.id}`);
      return buildOutputKey(organizationId, row.projectId, typeGenerate, name);
    };
    const names = resolveGalleryResultUrls(row);
    if (names.length === 0) throw new Error(`gallery ${row.id} has no generated file`);

    const items: PreviewItem[] = [];
    for (const [index, name] of names.entries()) {
      const key = buildCommunityPreviewKey(organizationId, publicationId, String(index), extname(name));
      await this.copy(sourceKey(name), key);
      items.push({ key, thumbnailKey: null, typeGenerate, order: index });
    }
    if (row.thumbnailUrl) {
      const thumbnailKey = buildCommunityPreviewKey(
        organizationId,
        publicationId,
        'thumbnail',
        extname(row.thumbnailUrl),
      );
      await this.copy(sourceKey(row.thumbnailUrl), thumbnailKey);
      items[0].thumbnailKey = thumbnailKey;
    }
    return items;
  }

  private async copy(source: string, target: string): Promise<void> {
    // TosService.copyObject log แล้วคืน undefined เมื่อพัง แทนการโยน
    const copied = await this.tos.copyObject(this.bucket, source, target);
    if (!copied) throw new Error(`copy failed: ${source}`);
  }

  private async deletePreviews(items: PreviewItem[]): Promise<void> {
    const keys = items.flatMap((item) =>
      item.thumbnailKey ? [item.key, item.thumbnailKey] : [item.key],
    );
    await Promise.all(keys.map((key) => this.tos.deleteObject(this.bucket, key)));
  }

  private async orgNames(organizationIds: string[]): Promise<Map<string, string>> {
    if (organizationIds.length === 0) return new Map();
    const orgs = await this.orgRepo.findMany({
      where: { organizationId: { in: [...new Set(organizationIds)] } },
      select: { organizationId: true, name: true },
    });
    return new Map(orgs.map((org) => [org.organizationId, org.name]));
  }

  private toPublicPublication(row: FeedRow, organizationName: string | null): PublicPublication {
    const items = readPreviewItems(row.previewItems);
    return {
      id: row.id,
      organizationId: row.organizationId,
      organizationName,
      type: items[0] ? toGenerationTypeKey(items[0].typeGenerate) : null,
      modelName: modelNameOf(row.gallery?.generateConfig ?? null),
      prompt: row.includePrompt ? (row.gallery?.prompt ?? null) : null,
      media: items.map((item, index) => ({
        type: toGenerationTypeKey(item.typeGenerate) ?? item.typeGenerate,
        url: this.previewUrl(row.id, index, false),
        thumbnailUrl: this.previewUrl(row.id, index, true),
      })),
      publishedAt: row.publishedAt,
      updatedAt: row.updatedAt,
    };
  }

  private previewUrl(publicationId: string, index: number, thumbnail: boolean): string {
    const base = this.config.publicApiBaseUrl.trim().replace(/\/+$/, '');
    if (!base) throw new Error('COMMUNITY_PUBLIC_API_BASE_URL is not set');
    const url = `${base}/public/community-publication/${publicationId}/media/${index}`;
    return thumbnail ? `${url}?thumbnail=1` : url;
  }

  private async memberRoleOrFail(organizationId: string, userId: string): Promise<string> {
    const member = await this.orgMemberRepo.findOne({ where: { organizationId, userId } });
    if (!member) throw new ForbiddenException('Not a member of this organization');
    return member.role;
  }
}

const describe = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);
