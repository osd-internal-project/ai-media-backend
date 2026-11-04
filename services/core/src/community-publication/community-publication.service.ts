import {
  BadGatewayException,
  ConflictException,
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
  Prisma,
} from '@prisma/client';
import { extname } from 'path';
import {
  AuthUser,
  CommunityPublicationRepository,
  GalleryRepository,
  OrganizationMemberRepository,
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
import { CommunityClient, CommunityItemMedia } from './community.client';
import {
  CommunityWebhookDto,
  CommunityWebhookEvent,
  ListPublicPublicationsQueryDto,
  PublishToCommunityDto,
} from './dto/community-publication.dto';

const { PENDING, PUBLISHED, REJECTED, REMOVED, FAILED } = CommunityPublicationStatus;
const MANAGE_ROLES = ['OWNER', 'ADMIN'];
const PREVIEW_THUMBNAIL_WIDTH = 480;
/** สถานะที่ Community ยังต้องเปิดไฟล์ preview ได้ (ตรวจงาน / แสดงผล) */
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
      status: typeof CommunityPublicationStatus.PENDING;
    }
  | {
      galleryId: string;
      publicationId: string;
      status: typeof CommunityPublicationStatus.FAILED;
      error: string;
    }
  | { galleryId: string; status: 'SKIPPED'; reason: PublishSkipReason };

/** event → สถานะใหม่ และสถานะที่เปลี่ยนจากได้ (webhook มาซ้ำหรือช้าต้องไม่ปลุกงานที่ถอดแล้ว) */
const WEBHOOK_TRANSITIONS: Record<
  CommunityWebhookEvent,
  { to: CommunityPublicationStatus; from: CommunityPublicationStatus[] }
> = {
  APPROVED: { to: PUBLISHED, from: [PENDING] },
  REJECTED: { to: REJECTED, from: [PENDING, PUBLISHED] },
  REMOVED: { to: REMOVED, from: [PENDING, PUBLISHED] },
};

const galleryInclude = Prisma.validator<Prisma.GalleryInclude>()({
  users: { select: { token: true, fullname: true } },
});
type PublishRow = Prisma.GalleryGetPayload<{ include: typeof galleryInclude }>;

const feedInclude = Prisma.validator<Prisma.CommunityPublicationInclude>()({
  gallery: { select: { prompt: true, generateConfig: true } },
});
type FeedRow = Prisma.CommunityPublicationGetPayload<{ include: typeof feedInclude }>;
const FEED_DEFAULT_LIMIT = 50;

export interface PublicPublication {
  id: string;
  organizationId: string;
  type: string | null;
  modelName: string | null;
  prompt: string | null;
  media: CommunityItemMedia[];
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
    private readonly usersRepo: UsersRepository,
    private readonly orgGallery: OrgGalleryService,
    private readonly storageUrl: StorageUrlService,
    private readonly tos: TosService,
    private readonly client: CommunityClient,
    @Inject(communityConfigs.KEY)
    private readonly config: ConfigType<typeof communityConfigs>,
  ) {}

  /**
   * เผยแพร่งานของตัวเองทีละชิ้น — ชิ้นที่ไม่ผ่านกฎถูกข้ามพร้อมเหตุผล ไม่ล้มทั้งชุด
   * กดซ้ำใช้แถวเดิม (galleryId unique) และ copy ทับ key เดิม
   */
  async publish(user: AuthUser, dto: PublishToCommunityDto): Promise<PublishResult[]> {
    await this.memberRoleOrFail(dto.organizationId, user.userId);
    const rows = (await this.galleryRepo.findMany({
      where: {
        id: { in: dto.galleryIds },
        project: { organizationId: dto.organizationId },
        OR: [{ genneratedStatus: 'SUCCESS' }, { genneratedStatus: null }],
      },
      include: galleryInclude,
      // repository รับ GalleryFindManyArgs แบบไม่ generic จึงเสีย type ของ include
    })) as PublishRow[];
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

  /** ถอดจาก Community — เจ้าของงาน หรือ OWNER/ADMIN ของ org */
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

    try {
      await this.client.deleteItem(publication.id);
    } catch (error) {
      throw new BadGatewayException(`Community did not remove the item: ${describe(error)}`);
    }
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

  /** ผลตรวจ / การถอดจากฝั่ง Community — ส่งซ้ำได้ ผลเท่าเดิม */
  async applyWebhook(dto: CommunityWebhookDto): Promise<{ status: CommunityPublicationStatus }> {
    const { to, from } = WEBHOOK_TRANSITIONS[dto.event];
    const { count } = await this.publicationRepo.updateMany({
      where: { id: dto.aicavePublicationId, status: { in: from } },
      data: {
        status: to,
        ...(to === PUBLISHED && { publishedAt: new Date(), error: null }),
        ...(to === REJECTED && { error: dto.reason ?? null }),
        ...(dto.communityItemId && { communityItemId: dto.communityItemId }),
      },
    });
    if (count === 1) return { status: to };

    const current = await this.publicationRepo.findOne({
      where: { id: dto.aicavePublicationId },
    });
    if (!current) throw new NotFoundException('Publication not found');
    if (current.status === to) return { status: to };
    throw new ConflictException(`Cannot apply ${dto.event} to a ${current.status} publication`);
  }

  /** งานที่ Community อนุมัติและเปิด PUBLIC ทุก org — คืนเป็น link คงที่ ไม่ใช่ไฟล์ */
  async listPublic(
    query: ListPublicPublicationsQueryDto,
  ): Promise<{ items: PublicPublication[]; nextCursor: string | null }> {
    const limit = query.limit ?? FEED_DEFAULT_LIMIT;
    const rows = (await this.publicationRepo.findMany({
      where: {
        status: PUBLISHED,
        visibility: 'PUBLIC',
        ...(query.updatedSince && { updatedAt: { gte: new Date(query.updatedSince) } }),
      },
      include: feedInclude,
      orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
      take: limit + 1,
      ...(query.cursor && { cursor: { id: query.cursor }, skip: 1 }),
      // repository รับ FindManyArgs แบบไม่ generic จึงเสีย type ของ include
    })) as FeedRow[];
    const page = rows.slice(0, limit);
    return {
      items: page.map((row) => this.toPublicPublication(row)),
      nextCursor: rows.length > limit ? page[page.length - 1].id : null,
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
        data: { previewItems: previewItems as unknown as Prisma.InputJsonValue },
      });
      const communityItemId = await this.client.upsertItem({
        aicavePublicationId: publication.id,
        creator: { keycloakSub: row.users.token, fullname: row.users.fullname },
        organizationId,
        visibility: dto.visibility,
        type: toGenerationTypeKey(row.typeGenerate),
        modelName: modelNameOf(row.generateConfig),
        prompt: dto.includePrompt ? row.prompt : null,
        media: previewItems.map((item, index) => ({
          type: toGenerationTypeKey(item.typeGenerate) ?? item.typeGenerate,
          url: this.previewUrl(publication.id, index, false),
          thumbnailUrl: this.previewUrl(publication.id, index, true),
        })),
        createdAt: row.createdAt.toISOString(),
      });
      if (communityItemId) {
        await this.publicationRepo.update({
          where: { id: publication.id },
          data: { communityItemId },
        });
      }
      return { galleryId: row.id, publicationId: publication.id, status: PENDING };
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

  private toPublicPublication(row: FeedRow): PublicPublication {
    const items = readPreviewItems(row.previewItems);
    return {
      id: row.id,
      organizationId: row.organizationId,
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
