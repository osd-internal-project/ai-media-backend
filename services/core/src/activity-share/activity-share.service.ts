import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { AuditAction, Prisma } from '@prisma/client';
import {
  ALLOWED_TRANSITIONS,
  ActivityShareAction,
  ActivityShareLogRepository,
  ActivityShareRepository,
  ActivityShareStatus,
  ActivityShareTargetRepository,
  EDITABLE_STATUSES,
  GalleryRepository,
  MAX_MEDIA_PER_SHARE,
  OrganizationMemberRepository,
  PLATFORM_CAPABILITIES,
  PrismaService,
  QUEUE_NAME_SOCIAL_PUBLISH,
  ShareMediaItem,
  SocialAccountRepository,
  SocialPlatform,
  SocialPublishJobData,
  StorageUrlService,
  TQueryClient,
  VIDEO_GENERATE_TYPES,
  buildOutputKey,
  isAbsoluteUrl,
  resolveGalleryResultUrls,
} from '@ai-media/share';
import { LogsService } from '../logs/logs.service';
import {
  CreateActivityShareDto,
  ShareMediaItemDto,
} from './dto/create-activity-share.dto';
import {
  ListActivityShareDto,
  ReviewActivityShareDto,
  UpdateActivityShareDto,
} from './dto/update-activity-share.dto';

/** role ที่อนุมัติ/ปฏิเสธงาน share ได้ */
const APPROVER_ROLES = ['OWNER', 'ADMIN'];

/** ผู้กระทำของ transition */
interface Actor {
  readonly userId: string | null;
  readonly type: 'USER' | 'SYSTEM';
}

@Injectable()
export class ActivityShareService {
  private readonly logger = new Logger(ActivityShareService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly shareRepo: ActivityShareRepository,
    private readonly targetRepo: ActivityShareTargetRepository,
    private readonly shareLogRepo: ActivityShareLogRepository,
    private readonly socialAccountRepo: SocialAccountRepository,
    private readonly galleryRepo: GalleryRepository,
    private readonly orgMemberRepo: OrganizationMemberRepository,
    private readonly storageUrl: StorageUrlService,
    private readonly logsService: LogsService,
    @InjectQueue(QUEUE_NAME_SOCIAL_PUBLISH)
    private readonly publishQueue: Queue<SocialPublishJobData>,
  ) {}

  // ==========================================================================
  // Commands
  // ==========================================================================

  /**
   * สร้างงาน share ใหม่ในสถานะ NEW (รออนุมัติ)
   *
   * @param dto เนื้อหา สื่อที่เลือก และบัญชีปลายทาง
   * @returns งานที่สร้างพร้อม target
   * @throws BadRequestException เมื่อสื่อหรือบัญชีไม่ถูกต้อง หรือขัดข้อจำกัดของ platform
   */
  async create(dto: CreateActivityShareDto) {
    await this.assertOrgMember(dto.organizationId, dto.userId);

    const mediaItems = await this.resolveMediaItems(
      dto.mediaItems,
      dto.projectId,
      dto.organizationId,
    );
    const accounts = await this.loadTargetAccounts(
      dto.socialAccountIds,
      dto.organizationId,
    );
    this.assertContentFitsPlatforms(
      mediaItems,
      dto.caption ?? '',
      accounts.map((account) => account.platform as SocialPlatform),
    );

    const created = await this.prisma.$transaction(async (tx) => {
      const share = await this.shareRepo.create(
        {
          data: {
            organizationId: dto.organizationId,
            projectId: dto.projectId,
            createdByUserId: dto.userId,
            caption: dto.caption ?? '',
            hashtags: dto.hashtags ?? [],
            linkUrl: dto.linkUrl ?? null,
            mediaItems: mediaItems as unknown as Prisma.InputJsonValue,
            status: 'NEW',
          },
        },
        { prisma: tx as unknown as TQueryClient },
      );

      await this.targetRepo.createMany(
        {
          data: accounts.map((account) => ({
            activityShareId: share.id,
            socialAccountId: account.id,
            platform: account.platform,
            status: 'PENDING',
          })),
        },
        { prisma: tx as unknown as TQueryClient },
      );

      await this.writeLog(
        {
          activityShareId: share.id,
          action: 'CREATE',
          fromStatus: null,
          toStatus: 'NEW',
          actor: { userId: dto.userId, type: 'USER' },
          metadata: {
            mediaCount: mediaItems.length,
            platforms: accounts.map((account) => account.platform),
          },
        },
        tx as unknown as TQueryClient,
      );

      return share;
    });

    this.mirrorToAuditLog(dto.userId, 'CREATE', created.id, null, {
      status: 'NEW',
      platforms: accounts.map((account) => account.platform),
    });

    return this.findOne(created.id);
  }

  /**
   * แก้ไขงานที่ยัง NEW หรือถูก REJECTED
   *
   * งานที่เคย REJECTED จะถูกส่งกลับเป็น NEW อัตโนมัติเพื่อเข้าคิวอนุมัติรอบใหม่
   *
   * @param id id ของงาน
   * @param dto field ที่ต้องการแก้ (ส่งเฉพาะที่เปลี่ยน)
   * @returns งานหลังแก้ไข
   * @throws ForbiddenException เมื่อไม่ใช่เจ้าของงาน
   * @throws BadRequestException เมื่อสถานะปัจจุบันแก้ไขไม่ได้
   */
  async update(id: string, dto: UpdateActivityShareDto) {
    const share = await this.getOrFail(id);
    this.assertOwner(share.createdByUserId, dto.userId);

    if (!EDITABLE_STATUSES.includes(share.status as ActivityShareStatus)) {
      throw new BadRequestException(
        `A share in status ${share.status} can no longer be edited`,
      );
    }

    const mediaItems = dto.mediaItems
      ? await this.resolveMediaItems(
          dto.mediaItems,
          share.projectId,
          share.organizationId,
        )
      : (share.mediaItems as unknown as ShareMediaItem[]);

    const accounts = dto.socialAccountIds
      ? await this.loadTargetAccounts(
          dto.socialAccountIds,
          share.organizationId,
        )
      : null;

    const platforms = accounts
      ? accounts.map((account) => account.platform as SocialPlatform)
      : (
          await this.targetRepo.findMany({ where: { activityShareId: id } })
        ).map((target) => target.platform as SocialPlatform);

    this.assertContentFitsPlatforms(
      mediaItems,
      dto.caption ?? share.caption,
      platforms,
    );

    const diff = this.buildDiff(share, dto, mediaItems, accounts);

    await this.prisma.$transaction(async (tx) => {
      await this.shareRepo.update(
        {
          where: { id },
          data: {
            ...(dto.caption !== undefined && { caption: dto.caption }),
            ...(dto.hashtags !== undefined && { hashtags: dto.hashtags }),
            ...(dto.linkUrl !== undefined && { linkUrl: dto.linkUrl }),
            ...(dto.mediaItems !== undefined && {
              mediaItems: mediaItems as unknown as Prisma.InputJsonValue,
            }),
            // แก้แล้วส่งกลับเข้าคิวอนุมัติ พร้อมล้างผลรีวิวรอบก่อน
            ...(share.status === 'REJECTED' && {
              status: 'NEW',
              reviewedByUserId: null,
              reviewedAt: null,
              reviewNote: null,
            }),
          },
        },
        { prisma: tx as unknown as TQueryClient },
      );

      if (accounts) {
        await this.replaceTargets(id, accounts, tx as unknown as TQueryClient);
      }

      await this.writeLog(
        {
          activityShareId: id,
          action: 'UPDATE',
          fromStatus: share.status,
          toStatus: share.status === 'REJECTED' ? 'NEW' : share.status,
          actor: { userId: dto.userId, type: 'USER' },
          metadata: diff as unknown as Prisma.InputJsonValue,
        },
        tx as unknown as TQueryClient,
      );
    });

    this.mirrorToAuditLog(dto.userId, 'UPDATE', id, diff.before, diff.after);
    return this.findOne(id);
  }

  /**
   * อนุมัติงาน — เปลี่ยน NEW เป็น APPROVED
   *
   * @param id id ของงาน
   * @param dto ผู้อนุมัติ + โน้ต
   * @returns งานหลังอนุมัติ
   * @throws ForbiddenException เมื่อผู้ใช้ไม่ใช่ OWNER/ADMIN
   */
  async approve(id: string, dto: ReviewActivityShareDto) {
    return this.review(id, dto, 'APPROVED', 'APPROVE');
  }

  /**
   * ปฏิเสธงาน — เปลี่ยน NEW เป็น REJECTED (ต้องระบุเหตุผล)
   *
   * @param id id ของงาน
   * @param dto ผู้ปฏิเสธ + เหตุผล (บังคับ)
   * @returns งานหลังปฏิเสธ
   * @throws BadRequestException เมื่อไม่ระบุเหตุผล
   */
  async reject(id: string, dto: ReviewActivityShareDto) {
    if (!dto.reviewNote?.trim()) {
      throw new BadRequestException('A reason is required when rejecting');
    }
    return this.review(id, dto, 'REJECTED', 'REJECT');
  }

  /**
   * ส่งงานที่อนุมัติแล้วเข้าคิวเผยแพร่
   *
   * ใช้ conditional update (updateMany + เช็ค count) แทน update ธรรมดา
   * เพื่อกันการกดปุ่ม Send ซ้ำ/พร้อมกันสองรีเควสต์แล้วเข้าคิวสองงาน
   *
   * @param id id ของงาน
   * @param userId ผู้กดส่ง (ต้องเป็นเจ้าของงาน)
   * @returns งานหลังเข้าคิว
   * @throws BadRequestException เมื่อสถานะไม่ใช่ APPROVED หรือมีคนกดไปแล้ว
   */
  async send(id: string, userId: string) {
    const share = await this.getOrFail(id);
    this.assertOwner(share.createdByUserId, userId);
    this.assertTransitionAllowed(share.status as ActivityShareStatus, 'PENDING');

    await this.prisma.$transaction(async (tx) => {
      const { count } = await this.shareRepo.updateMany(
        {
          where: { id, status: 'APPROVED' },
          data: { status: 'PENDING', sentAt: new Date() },
        },
        { prisma: tx as unknown as TQueryClient },
      );
      if (count !== 1) {
        throw new BadRequestException(
          'This share was already sent or is no longer approved',
        );
      }

      await this.writeLog(
        {
          activityShareId: id,
          action: 'SEND',
          fromStatus: 'APPROVED',
          toStatus: 'PENDING',
          actor: { userId, type: 'USER' },
        },
        tx as unknown as TQueryClient,
      );
    });

    await this.enqueuePublish(id);
    this.mirrorToAuditLog(userId, 'UPDATE', id, { status: 'APPROVED' }, {
      status: 'PENDING',
    });
    return this.findOne(id);
  }

  /**
   * ลองเผยแพร่ใหม่เฉพาะ target ที่ล้มเหลว
   *
   * target ที่สำเร็จแล้วจะไม่ถูกแตะ — ไม่งั้นจะเกิดโพสต์ซ้ำบน platform นั้น
   *
   * @param id id ของงาน
   * @param userId ผู้กด retry (ต้องเป็นเจ้าของงาน)
   * @returns งานหลังเข้าคิวใหม่
   * @throws BadRequestException เมื่อสถานะไม่ใช่ FAILED หรือไม่มี target ที่ล้มเหลว
   */
  async retry(id: string, userId: string) {
    const share = await this.getOrFail(id);
    this.assertOwner(share.createdByUserId, userId);
    this.assertTransitionAllowed(share.status as ActivityShareStatus, 'PENDING');

    const failedTargets = await this.targetRepo.findMany({
      where: { activityShareId: id, status: 'FAILED' },
    });
    if (failedTargets.length === 0) {
      throw new BadRequestException('There is no failed target to retry');
    }
    const targetIds = failedTargets.map((target) => target.id);

    await this.prisma.$transaction(async (tx) => {
      const { count } = await this.shareRepo.updateMany(
        {
          where: { id, status: 'FAILED' },
          data: { status: 'PENDING' },
        },
        { prisma: tx as unknown as TQueryClient },
      );
      if (count !== 1) {
        throw new BadRequestException('This share is no longer in a failed state');
      }

      await this.targetRepo.updateMany(
        {
          where: { id: { in: targetIds } },
          data: { status: 'PENDING', errorCode: null, errorMessage: null },
        },
        { prisma: tx as unknown as TQueryClient },
      );

      await this.writeLog(
        {
          activityShareId: id,
          action: 'RETRY',
          fromStatus: 'FAILED',
          toStatus: 'PENDING',
          actor: { userId, type: 'USER' },
          metadata: { targetIds },
        },
        tx as unknown as TQueryClient,
      );
    });

    await this.enqueuePublish(id, targetIds);
    return this.findOne(id);
  }

  /**
   * ลบงานที่ยังไม่ถูกเผยแพร่
   *
   * ลบจริง (ไม่ soft delete) ตาม convention ของโปรเจกต์ — target และ log
   * จะถูกลบตามด้วย FK cascade
   *
   * @param id id ของงาน
   * @param userId ผู้ลบ (ต้องเป็นเจ้าของงาน)
   * @throws BadRequestException เมื่อสถานะลบไม่ได้แล้ว
   */
  async remove(id: string, userId: string) {
    const share = await this.getOrFail(id);
    this.assertOwner(share.createdByUserId, userId);

    if (!EDITABLE_STATUSES.includes(share.status as ActivityShareStatus)) {
      throw new BadRequestException(
        `A share in status ${share.status} can no longer be deleted`,
      );
    }

    await this.shareRepo.delete({ where: { id } });
    this.mirrorToAuditLog(userId, 'DELETE', id, { status: share.status }, null);
    return { id };
  }

  // ==========================================================================
  // Queries
  // ==========================================================================

  /**
   * รายการงาน share แบบแบ่งหน้า
   *
   * @param query ตัวกรองและหน้า
   * @returns data + total สำหรับ server-side pagination
   */
  async findMany(query: ListActivityShareDto) {
    const page = Number(query.page) > 0 ? Number(query.page) : 1;
    const pageSize = Number(query.pageSize) > 0 ? Number(query.pageSize) : 10;

    const where: Prisma.ActivityShareWhereInput = {
      organizationId: query.organizationId,
      ...(query.projectId && { projectId: query.projectId }),
      ...(query.status && { status: query.status }),
      ...(query.createdByUserId && { createdByUserId: query.createdByUserId }),
      ...(query.search && {
        caption: { contains: query.search, mode: 'insensitive' },
      }),
      ...(query.platform && {
        targets: { some: { platform: query.platform } },
      }),
    };

    const [rows, total] = await Promise.all([
      this.shareRepo.findMany({
        where,
        include: { targets: true },
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.shareRepo.count({ where }),
    ]);

    const data = await Promise.all(
      rows.map(async (row) => ({
        ...row,
        // list view ต้องการแค่รูปตัวอย่างใบแรก ไม่ต้อง presign ทุกไฟล์
        previewUrl: await this.resolvePreviewUrl(row.mediaItems),
      })),
    );

    return { data, total, page, pageSize };
  }

  /**
   * รายละเอียดงาน 1 ใบ พร้อม target และไทม์ไลน์ log
   *
   * @param id id ของงาน
   * @returns งานพร้อมสื่อที่ presign เป็น URL แล้ว
   * @throws NotFoundException เมื่อไม่พบงาน
   */
  async findOne(id: string) {
    // เรียก prisma ตรงแทน repository เพราะ signature ของ repo รับ Prisma.XxxArgs แบบ
    // ไม่ generic ทำให้ type ของ include (targets/logs) หายไป — read path ที่ต้อง
    // อ่าน relation ต่อจึงใช้ client ตรงเพื่อคง type ไว้
    const share = await this.prisma.activityShare.findUnique({
      where: { id },
      include: {
        targets: { include: { socialAccount: true } },
        logs: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!share) {
      throw new NotFoundException('Activity share not found');
    }

    const mediaItems = (share.mediaItems ?? []) as unknown as ShareMediaItem[];
    const media = await Promise.all(
      mediaItems.map(async (item) => ({
        ...item,
        url: await this.storageUrl.toDisplayUrl(item.resultKey),
        thumbnailUrl: await this.storageUrl.toDisplayUrl(item.thumbnailKey),
      })),
    );

    return {
      ...share,
      media,
      targets: share.targets.map((target) => ({
        ...target,
        // ตัด token ออกจาก response เสมอ
        socialAccount: target.socialAccount
          ? {
              id: target.socialAccount.id,
              platform: target.socialAccount.platform,
              displayName: target.socialAccount.displayName,
              avatarUrl: target.socialAccount.avatarUrl,
              status: target.socialAccount.status,
            }
          : null,
      })),
    };
  }

  /**
   * จำนวนงานที่รออนุมัติของ org — ใช้แสดง badge บนแท็บ Approvals
   *
   * @param organizationId org ที่สนใจ
   * @returns จำนวนงานสถานะ NEW
   */
  async countPendingApproval(organizationId: string) {
    const count = await this.shareRepo.count({
      where: { organizationId, status: 'NEW' },
    });
    return { count };
  }

  // ==========================================================================
  // Internals
  // ==========================================================================

  /**
   * ตรรกะร่วมของ approve/reject
   *
   * @param id id ของงาน
   * @param dto ผู้รีวิว + โน้ต
   * @param toStatus สถานะปลายทาง
   * @param action action ที่จะบันทึกลง log
   * @returns งานหลังรีวิว
   */
  private async review(
    id: string,
    dto: ReviewActivityShareDto,
    toStatus: ActivityShareStatus,
    action: ActivityShareAction,
  ) {
    const share = await this.getOrFail(id);
    await this.assertApprover(share.organizationId, dto.userId);
    this.assertTransitionAllowed(share.status as ActivityShareStatus, toStatus);

    await this.prisma.$transaction(async (tx) => {
      const { count } = await this.shareRepo.updateMany(
        {
          where: { id, status: share.status },
          data: {
            status: toStatus,
            reviewedByUserId: dto.userId,
            reviewedAt: new Date(),
            reviewNote: dto.reviewNote ?? null,
          },
        },
        { prisma: tx as unknown as TQueryClient },
      );
      if (count !== 1) {
        throw new BadRequestException(
          'This share was already reviewed by someone else',
        );
      }

      await this.writeLog(
        {
          activityShareId: id,
          action,
          fromStatus: share.status,
          toStatus,
          actor: { userId: dto.userId, type: 'USER' },
          note: dto.reviewNote ?? null,
        },
        tx as unknown as TQueryClient,
      );
    });

    this.mirrorToAuditLog(
      dto.userId,
      'UPDATE',
      id,
      { status: share.status },
      { status: toStatus, reviewNote: dto.reviewNote ?? null },
    );
    return this.findOne(id);
  }

  /**
   * เขียนแถว activity_share_log
   *
   * ทุก transition ต้องเรียกผ่านที่นี่ และต้องอยู่ใน transaction เดียวกับการอัปเดต
   * สถานะเสมอ — ไม่งั้น log กับสถานะจริงจะไม่ตรงกันเมื่อมีอะไรพังกลางทาง
   *
   * @param entry ข้อมูล log
   * @param tx transaction client
   */
  private async writeLog(
    entry: {
      activityShareId: string;
      activityShareTargetId?: string | null;
      action: ActivityShareAction;
      fromStatus: string | null;
      toStatus: string;
      actor: Actor;
      note?: string | null;
      metadata?: Prisma.InputJsonValue;
    },
    tx: TQueryClient,
  ): Promise<void> {
    await this.shareLogRepo.create(
      {
        data: {
          activityShareId: entry.activityShareId,
          activityShareTargetId: entry.activityShareTargetId ?? null,
          action: entry.action,
          fromStatus: entry.fromStatus,
          toStatus: entry.toStatus,
          actionUserId: entry.actor.userId,
          actorType: entry.actor.type,
          note: entry.note ?? null,
          ...(entry.metadata !== undefined && { metadata: entry.metadata }),
        },
      },
      { prisma: tx as unknown as TQueryClient },
    );
  }

  /**
   * ตรวจว่า transition นี้อนุญาตตาม state machine
   *
   * @param from สถานะปัจจุบัน
   * @param to สถานะปลายทาง
   * @throws BadRequestException เมื่อไม่อนุญาต
   */
  private assertTransitionAllowed(
    from: ActivityShareStatus,
    to: ActivityShareStatus,
  ): void {
    if (!ALLOWED_TRANSITIONS[from]?.includes(to)) {
      throw new BadRequestException(
        `Cannot move a share from ${from} to ${to}`,
      );
    }
  }

  /**
   * แปลง gallery id ที่ผู้ใช้เลือกเป็น snapshot ของ object key
   *
   * ตรวจด้วยว่าทุกชิ้นอยู่ใน project เดียวกับงาน — กันการอ้าง gallery ข้าม project
   *
   * หมายเหตุ: gallery เก็บแค่ "ชื่อไฟล์" ไม่ใช่ key เต็ม (key ประกอบจาก org/project/type
   * ตอน read ผ่าน resolveOutputUrl) — ที่นี่จึงประกอบ key เต็มด้วย buildOutputKey
   * แล้วเก็บลง snapshot เพื่อให้ worker ใช้ได้โดยไม่ต้องรู้ context ของ project อีก
   *
   * @param items รายการที่เลือกจาก frontend
   * @param projectId project ของงาน
   * @param organizationId org ของงาน (ใช้ประกอบ key)
   * @returns snapshot ที่พร้อมเก็บลง media_items
   * @throws BadRequestException เมื่อมี id ที่ไม่พบ ไม่อยู่ใน project หรือยังไม่มีไฟล์ผลลัพธ์
   */
  private async resolveMediaItems(
    items: ShareMediaItemDto[],
    projectId: string,
    organizationId: string,
  ): Promise<ShareMediaItem[]> {
    if (items.length === 0 || items.length > MAX_MEDIA_PER_SHARE) {
      throw new BadRequestException(
        `Select between 1 and ${MAX_MEDIA_PER_SHARE} items`,
      );
    }

    const galleryIds = items.map((item) => item.galleryId);
    const rows = await this.galleryRepo.findMany({
      where: { id: { in: galleryIds }, projectId },
    });

    const byId = new Map(rows.map((row) => [row.id, row]));
    return items.map((item, index) => {
      const row = byId.get(item.galleryId);
      if (!row) {
        throw new BadRequestException(
          `Gallery item ${item.galleryId} does not exist in this project`,
        );
      }
      const [objectName] = resolveGalleryResultUrls(row);
      if (!objectName) {
        throw new BadRequestException(
          `Gallery item ${item.galleryId} has no generated file yet`,
        );
      }
      const typeGenerate = row.typeGenerate ?? 'image';
      // ค่าที่เป็น URL เต็มอยู่แล้ว (data เก่า) ห้ามเอาไปต่อ path
      const toKey = (name: string) =>
        isAbsoluteUrl(name)
          ? name
          : buildOutputKey(organizationId, projectId, typeGenerate, name);

      return {
        galleryId: row.id,
        resultKey: toKey(objectName),
        thumbnailKey: row.thumbnailUrl ? toKey(row.thumbnailUrl) : null,
        typeGenerate,
        order: index,
      };
    });
  }

  /**
   * โหลดบัญชีปลายทางและตรวจว่าใช้งานได้จริง
   *
   * @param accountIds id ของบัญชีที่เลือก
   * @param organizationId org ของงาน
   * @returns บัญชีที่ตรวจแล้ว
   * @throws BadRequestException เมื่อมีบัญชีที่ไม่อยู่ใน org หรือสถานะไม่ ACTIVE
   */
  private async loadTargetAccounts(
    accountIds: string[],
    organizationId: string,
  ) {
    const unique = [...new Set(accountIds)];
    const accounts = await this.socialAccountRepo.findMany({
      where: { id: { in: unique }, organizationId },
    });

    if (accounts.length !== unique.length) {
      throw new BadRequestException(
        'One or more selected accounts do not belong to this organization',
      );
    }
    const unusable = accounts.filter((account) => account.status !== 'ACTIVE');
    if (unusable.length > 0) {
      throw new BadRequestException(
        `Reconnect these accounts before posting: ${unusable
          .map((account) => account.displayName)
          .join(', ')}`,
      );
    }
    return accounts;
  }

  /**
   * ตรวจเนื้อหากับข้อจำกัดของทุก platform ที่เลือก
   *
   * ตรวจตั้งแต่ตอนสร้างงาน ไม่รอให้ไปพังตอน worker ยิง API — ผู้ใช้จะได้แก้ได้ทันที
   * และแอดมินจะไม่เสียเวลาอนุมัติงานที่ยังไงก็โพสต์ไม่ได้
   *
   * @param mediaItems สื่อที่เลือก
   * @param caption caption
   * @param platforms platform ปลายทางทั้งหมด
   * @throws BadRequestException พร้อมเหตุผลที่อ่านรู้เรื่องเมื่อผิดข้อจำกัด
   */
  private assertContentFitsPlatforms(
    mediaItems: ShareMediaItem[],
    caption: string,
    platforms: SocialPlatform[],
  ): void {
    const hasVideo = mediaItems.some((item) =>
      VIDEO_GENERATE_TYPES.includes(item.typeGenerate),
    );
    const hasImage = mediaItems.some(
      (item) => !VIDEO_GENERATE_TYPES.includes(item.typeGenerate),
    );

    for (const platform of new Set(platforms)) {
      const capability = PLATFORM_CAPABILITIES[platform];
      if (!capability) {
        throw new BadRequestException(`Unsupported platform ${platform}`);
      }
      if (hasVideo && !capability.allowsVideo) {
        throw new BadRequestException(`${platform} does not accept video posts`);
      }
      if (hasImage && !capability.allowsImage) {
        throw new BadRequestException(`${platform} only accepts video posts`);
      }
      if (hasVideo && hasImage && !capability.allowsMixedMedia) {
        throw new BadRequestException(
          `${platform} cannot mix images and video in one post`,
        );
      }
      if (mediaItems.length > capability.maxMediaCount) {
        throw new BadRequestException(
          `${platform} accepts at most ${capability.maxMediaCount} item(s) per post`,
        );
      }
      if (caption.length > capability.maxCaptionLength) {
        throw new BadRequestException(
          `${platform} allows at most ${capability.maxCaptionLength} caption characters`,
        );
      }
    }
  }

  /**
   * แทนที่ target ทั้งชุดตอนผู้ใช้เปลี่ยนปลายทาง
   *
   * ปลอดภัยเพราะเรียกได้เฉพาะตอนงานยัง NEW/REJECTED เท่านั้น — ยังไม่มี target
   * ไหนถูกเผยแพร่ จึงไม่มีผลลัพธ์ให้เสียหาย
   *
   * @param shareId id ของงาน
   * @param accounts บัญชีปลายทางชุดใหม่
   * @param tx transaction client
   */
  private async replaceTargets(
    shareId: string,
    accounts: { id: string; platform: string }[],
    tx: TQueryClient,
  ): Promise<void> {
    await this.targetRepo.deleteMany(
      { where: { activityShareId: shareId } },
      { prisma: tx as unknown as TQueryClient },
    );
    await this.targetRepo.createMany(
      {
        data: accounts.map((account) => ({
          activityShareId: shareId,
          socialAccountId: account.id,
          platform: account.platform,
          status: 'PENDING',
        })),
      },
      { prisma: tx as unknown as TQueryClient },
    );
  }

  /**
   * ใส่งานลงคิวเผยแพร่
   *
   * @param activityShareId id ของงาน
   * @param targetIds จำกัดเฉพาะ target ที่ระบุ (ตอน retry)
   */
  private async enqueuePublish(
    activityShareId: string,
    targetIds?: string[],
  ): Promise<void> {
    await this.publishQueue.add(
      'publish',
      { activityShareId, ...(targetIds && { targetIds }) },
      {
        // jobId ผูกกับ share + รอบการส่ง เพื่อกัน job ซ้ำจาก retry ที่ยิงถี่
        jobId: `${activityShareId}:${Date.now()}`,
        removeOnComplete: 100,
        removeOnFail: 500,
      },
    );
  }

  /**
   * สรุป field ที่เปลี่ยนสำหรับเก็บลง log
   *
   * @param share แถวก่อนแก้
   * @param dto ค่าที่ส่งมาแก้
   * @param mediaItems สื่อหลังแก้
   * @param accounts บัญชีปลายทางหลังแก้ (null = ไม่เปลี่ยน)
   * @returns before/after ของเฉพาะ field ที่เปลี่ยนจริง
   */
  private buildDiff(
    share: { caption: string; hashtags: string[]; linkUrl: string | null },
    dto: UpdateActivityShareDto,
    mediaItems: ShareMediaItem[],
    accounts: { id: string }[] | null,
  ): { before: Record<string, unknown>; after: Record<string, unknown> } {
    const before: Record<string, unknown> = {};
    const after: Record<string, unknown> = {};

    if (dto.caption !== undefined && dto.caption !== share.caption) {
      before.caption = share.caption;
      after.caption = dto.caption;
    }
    if (dto.hashtags !== undefined) {
      before.hashtags = share.hashtags;
      after.hashtags = dto.hashtags;
    }
    if (dto.linkUrl !== undefined && dto.linkUrl !== share.linkUrl) {
      before.linkUrl = share.linkUrl;
      after.linkUrl = dto.linkUrl;
    }
    if (dto.mediaItems !== undefined) {
      after.mediaCount = mediaItems.length;
    }
    if (accounts) {
      after.socialAccountIds = accounts.map((account) => account.id);
    }
    return { before, after };
  }

  /**
   * presign รูปตัวอย่างใบแรกสำหรับหน้า list
   *
   * @param mediaItems ค่า media_items ดิบจาก DB
   * @returns URL หรือ null เมื่อไม่มีสื่อ
   */
  private async resolvePreviewUrl(
    mediaItems: Prisma.JsonValue,
  ): Promise<string | null> {
    const items = (mediaItems ?? []) as unknown as ShareMediaItem[];
    const first = items[0];
    if (!first) return null;
    return this.storageUrl.toDisplayUrl(first.thumbnailKey ?? first.resultKey);
  }

  /**
   * ดึงงานหรือโยน 404
   *
   * @param id id ของงาน
   * @returns แถว activity_share
   * @throws NotFoundException เมื่อไม่พบ
   */
  private async getOrFail(id: string) {
    const share = await this.shareRepo.findUnique({ where: { id } });
    if (!share) {
      throw new NotFoundException('Activity share not found');
    }
    return share;
  }

  /**
   * ตรวจว่าเป็นเจ้าของงาน
   *
   * @param ownerUserId เจ้าของงาน
   * @param userId ผู้กระทำ
   * @throws ForbiddenException เมื่อไม่ใช่คนเดียวกัน
   */
  private assertOwner(ownerUserId: string, userId: string): void {
    if (ownerUserId !== userId) {
      throw new ForbiddenException('Only the creator can perform this action');
    }
  }

  /**
   * ตรวจว่าเป็นสมาชิกของ org
   *
   * @param organizationId org ที่จะกระทำ
   * @param userId ผู้กระทำ
   * @throws ForbiddenException เมื่อไม่ใช่สมาชิก
   */
  private async assertOrgMember(
    organizationId: string,
    userId: string,
  ): Promise<void> {
    const member = await this.orgMemberRepo.findOne({
      where: { organizationId, userId },
    });
    if (!member) {
      throw new ForbiddenException(
        'You are not a member of this organization',
      );
    }
  }

  /**
   * ตรวจว่าเป็น OWNER/ADMIN ของ org (สิทธิ์อนุมัติ)
   *
   * @param organizationId org ของงาน
   * @param userId ผู้รีวิว
   * @throws ForbiddenException เมื่อ role ไม่พอ
   */
  private async assertApprover(
    organizationId: string,
    userId: string,
  ): Promise<void> {
    const member = await this.orgMemberRepo.findOne({
      where: { organizationId, userId },
    });
    if (!member || !APPROVER_ROLES.includes(member.role)) {
      throw new ForbiddenException(
        'Only an organization OWNER or ADMIN can review share requests',
      );
    }
  }

  /**
   * บันทึกลง audit_logs กลางของระบบด้วย
   *
   * activity_share_log คือไทม์ไลน์ที่ผู้ใช้เห็นในหน้าจอ ส่วน audit_logs คือหลักฐาน
   * เชิง compliance ข้ามโดเมน — จงใจเขียนทั้งคู่
   *
   * ยิงแบบ fire-and-forget เหมือน generate-helper.service.ts: audit ที่พังต้องไม่
   * ทำให้คำสั่งหลักที่สำเร็จไปแล้วกลายเป็น error
   *
   * @param userId ผู้กระทำ
   * @param action ชนิด action ของ audit log
   * @param entityId id ของงาน
   * @param oldValues ค่าก่อนเปลี่ยน
   * @param newValues ค่าหลังเปลี่ยน
   */
  private mirrorToAuditLog(
    userId: string,
    action: AuditAction,
    entityId: string,
    oldValues: unknown,
    newValues: unknown,
  ): void {
    this.logsService
      .logAudit(userId, action, 'activity_share', entityId, oldValues, newValues)
      .catch((error) => {
        this.logger.warn(
          `audit log failed for activity_share ${entityId}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      });
  }
}
