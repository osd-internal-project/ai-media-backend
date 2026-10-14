import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { AuditAction, Prisma } from '@prisma/client';
import {
  COMMUNITY_ALLOWED_TRANSITIONS,
  COMMUNITY_EDITABLE_STATUSES,
  CommunityMediaItem,
  CommunityPostAction,
  CommunityPostLogRepository,
  CommunityPostRepository,
  CommunityPostStatus,
  GalleryRepository,
  MAX_MEDIA_PER_COMMUNITY_POST,
  OrganizationMemberRepository,
  OrganizationRepository,
  PrismaService,
  StorageUrlService,
  TQueryClient,
  UsersRepository,
  VIDEO_GENERATE_TYPES,
  buildCommunitySlug,
  buildOutputKey,
  isAbsoluteUrl,
  resolveGalleryResultUrls,
} from '@ai-media/share';
import { LogsService } from '../logs/logs.service';
import {
  CommunityMediaItemDto,
  CreateCommunityPostDto,
} from './dto/create-community-post.dto';
import {
  ListCommunityPostDto,
  ReviewCommunityPostDto,
  ScheduleCommunityPostDto,
  UnpublishCommunityPostDto,
  UpdateCommunityPostDto,
} from './dto/update-community-post.dto';

/** role ที่อนุมัติ/ปฏิเสธ/ถอดโพสต์ได้ */
const APPROVER_ROLES = ['OWNER', 'ADMIN'];

/** ผู้กระทำของ transition */
interface Actor {
  readonly userId: string | null;
  readonly type: 'USER' | 'SYSTEM';
}

@Injectable()
export class CommunityPostService {
  private readonly logger = new Logger(CommunityPostService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly postRepo: CommunityPostRepository,
    private readonly postLogRepo: CommunityPostLogRepository,
    private readonly galleryRepo: GalleryRepository,
    private readonly orgMemberRepo: OrganizationMemberRepository,
    private readonly orgRepo: OrganizationRepository,
    private readonly usersRepo: UsersRepository,
    private readonly storageUrl: StorageUrlService,
    private readonly logsService: LogsService,
  ) {}

  // ==========================================================================
  // Commands
  // ==========================================================================

  /**
   * สร้างโพสต์ใหม่ในสถานะ NEW (รออนุมัติ)
   *
   * @param dto เนื้อหาและสื่อที่เลือก
   * @returns โพสต์ที่สร้างพร้อมสื่อที่ presign แล้ว
   * @throws BadRequestException เมื่อสื่อไม่ถูกต้องหรือไม่อยู่ใน project เดียวกัน
   */
  async create(dto: CreateCommunityPostDto) {
    await this.assertOrgMember(dto.organizationId, dto.userId);

    const { mediaItems, prompt } = await this.resolveMediaItems(
      dto.mediaItems,
      dto.projectId,
      dto.organizationId,
    );
    const attribution = await this.resolveAttribution(
      dto.organizationId,
      dto.userId,
    );

    const created = await this.prisma.$transaction(async (tx) => {
      const post = await this.postRepo.create(
        {
          data: {
            slug: buildCommunitySlug(dto.title),
            organizationId: dto.organizationId,
            projectId: dto.projectId,
            createdByUserId: dto.userId,
            title: dto.title,
            caption: dto.caption ?? '',
            hashtags: dto.hashtags ?? [],
            linkUrl: dto.linkUrl ?? null,
            mediaItems: mediaItems as unknown as Prisma.InputJsonValue,
            showPrompt: dto.showPrompt ?? false,
            // เก็บ prompt ลง DB เฉพาะเมื่อเจ้าของเลือกเปิดเผย — ไม่เก็บไว้เผื่อ
            promptSnapshot: dto.showPrompt ? prompt : null,
            authorDisplayName: attribution.authorDisplayName,
            organizationDisplayName: attribution.organizationDisplayName,
            status: 'NEW',
          },
        },
        { prisma: tx as unknown as TQueryClient },
      );

      await this.writeLog(
        {
          postId: post.id,
          action: 'CREATE',
          fromStatus: null,
          toStatus: 'NEW',
          actor: { userId: dto.userId, type: 'USER' },
          metadata: { mediaCount: mediaItems.length, title: dto.title },
        },
        tx as unknown as TQueryClient,
      );

      return post;
    });

    this.mirrorToAuditLog(dto.userId, 'CREATE', created.id, null, {
      status: 'NEW',
      slug: created.slug,
    });

    return this.findOne(created.id);
  }

  /**
   * แก้ไขโพสต์ที่ยัง NEW หรือถูก REJECTED
   *
   * โพสต์ที่เคย REJECTED จะถูกส่งกลับเป็น NEW อัตโนมัติเพื่อเข้าคิวอนุมัติรอบใหม่
   *
   * slug ไม่เปลี่ยนตาม title โดยตั้งใจ — โพสต์ยังไม่เคยเผยแพร่ก็จริง แต่การผูก slug
   * ไว้กับค่าแรกทำให้ไม่มีทางที่ URL สาธารณะจะขยับหลังเผยแพร่ไปแล้ว
   *
   * @param id id ของโพสต์
   * @param dto field ที่ต้องการแก้ (ส่งเฉพาะที่เปลี่ยน)
   * @returns โพสต์หลังแก้ไข
   * @throws ForbiddenException เมื่อไม่ใช่เจ้าของโพสต์
   * @throws BadRequestException เมื่อสถานะปัจจุบันแก้ไขไม่ได้
   */
  async update(id: string, dto: UpdateCommunityPostDto) {
    const post = await this.getOrFail(id);
    this.assertOwner(post.createdByUserId, dto.userId);

    if (!COMMUNITY_EDITABLE_STATUSES.includes(post.status as CommunityPostStatus)) {
      throw new BadRequestException(
        `A post in status ${post.status} can no longer be edited`,
      );
    }

    const resolved = dto.mediaItems
      ? await this.resolveMediaItems(
          dto.mediaItems,
          post.projectId,
          post.organizationId,
        )
      : null;

    const showPrompt = dto.showPrompt ?? post.showPrompt;
    const diff = this.buildDiff(post, dto, resolved?.mediaItems ?? null);

    await this.prisma.$transaction(async (tx) => {
      await this.postRepo.update(
        {
          where: { id },
          data: {
            ...(dto.title !== undefined && { title: dto.title }),
            ...(dto.caption !== undefined && { caption: dto.caption }),
            ...(dto.hashtags !== undefined && { hashtags: dto.hashtags }),
            ...(dto.linkUrl !== undefined && { linkUrl: dto.linkUrl }),
            ...(resolved && {
              mediaItems: resolved.mediaItems as unknown as Prisma.InputJsonValue,
            }),
            showPrompt,
            // ปิดการเปิดเผย prompt = ลบ snapshot ทิ้งจริง ไม่ใช่แค่ซ่อน
            promptSnapshot: showPrompt
              ? resolved?.prompt ?? post.promptSnapshot
              : null,
            // แก้แล้วส่งกลับเข้าคิวอนุมัติ พร้อมล้างผลรีวิวรอบก่อน
            ...(post.status === 'REJECTED' && {
              status: 'NEW',
              reviewedByUserId: null,
              reviewedAt: null,
              reviewNote: null,
            }),
          },
        },
        { prisma: tx as unknown as TQueryClient },
      );

      await this.writeLog(
        {
          postId: id,
          action: 'UPDATE',
          fromStatus: post.status,
          toStatus: post.status === 'REJECTED' ? 'NEW' : post.status,
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
   * อนุมัติโพสต์ — เปลี่ยน NEW เป็น APPROVED
   *
   * ถ้าส่ง scheduledAt มาด้วยจะตั้งเวลาเผยแพร่ต่อให้ในคำสั่งเดียว
   *
   * @param id id ของโพสต์
   * @param dto ผู้อนุมัติ + โน้ต + เวลาเผยแพร่ (ถ้ามี)
   * @returns โพสต์หลังอนุมัติ
   * @throws ForbiddenException เมื่อผู้ใช้ไม่ใช่ OWNER/ADMIN
   */
  async approve(id: string, dto: ReviewCommunityPostDto) {
    const approved = await this.review(id, dto, 'APPROVED', 'APPROVE');
    if (!dto.scheduledAt) return approved;

    return this.schedule(id, {
      userId: dto.userId,
      scheduledAt: dto.scheduledAt,
    });
  }

  /**
   * ปฏิเสธโพสต์ — เปลี่ยน NEW เป็น REJECTED (ต้องระบุเหตุผล)
   *
   * @param id id ของโพสต์
   * @param dto ผู้ปฏิเสธ + เหตุผล (บังคับ)
   * @returns โพสต์หลังปฏิเสธ
   * @throws BadRequestException เมื่อไม่ระบุเหตุผล
   */
  async reject(id: string, dto: ReviewCommunityPostDto) {
    if (!dto.reviewNote?.trim()) {
      throw new BadRequestException('A reason is required when rejecting');
    }
    return this.review(id, dto, 'REJECTED', 'REJECT');
  }

  /**
   * เผยแพร่โพสต์ที่อนุมัติแล้วทันที
   *
   * ต่างจาก Public Social ตรงที่ไม่มีคิว — ปลายทางคือ DB ของเราเอง การเผยแพร่
   * จึงเป็นแค่การเปลี่ยนสถานะ ไม่มี provider ให้รอ
   *
   * @param id id ของโพสต์
   * @param userId ผู้กดเผยแพร่ (ต้องเป็น OWNER/ADMIN ของ org)
   * @returns โพสต์หลังเผยแพร่
   * @throws BadRequestException เมื่อสถานะไม่ใช่ APPROVED หรือ SCHEDULED
   */
  async publish(id: string, userId: string) {
    const post = await this.getOrFail(id);
    await this.assertApprover(post.organizationId, userId);
    this.assertTransitionAllowed(
      post.status as CommunityPostStatus,
      'PUBLISHED',
    );

    await this.prisma.$transaction(async (tx) => {
      const { count } = await this.postRepo.updateMany(
        {
          where: { id, status: post.status },
          data: {
            status: 'PUBLISHED',
            publishedAt: new Date(),
            scheduledAt: null,
            unpublishedAt: null,
          },
        },
        { prisma: tx as unknown as TQueryClient },
      );
      if (count !== 1) {
        throw new BadRequestException(
          'This post was already published or its status changed',
        );
      }

      await this.writeLog(
        {
          postId: id,
          action: 'PUBLISH',
          fromStatus: post.status,
          toStatus: 'PUBLISHED',
          actor: { userId, type: 'USER' },
        },
        tx as unknown as TQueryClient,
      );
    });

    this.mirrorToAuditLog(
      userId,
      'UPDATE',
      id,
      { status: post.status },
      { status: 'PUBLISHED', slug: post.slug },
    );
    return this.findOne(id);
  }

  /**
   * ตั้งเวลาเผยแพร่ให้โพสต์ที่อนุมัติแล้ว
   *
   * @param id id ของโพสต์
   * @param dto ผู้ตั้งเวลา + เวลาเป้าหมาย (ISO 8601)
   * @returns โพสต์หลังตั้งเวลา
   * @throws BadRequestException เมื่อเวลาอยู่ในอดีต หรือสถานะไม่ใช่ APPROVED
   */
  async schedule(id: string, dto: ScheduleCommunityPostDto) {
    const post = await this.getOrFail(id);
    await this.assertApprover(post.organizationId, dto.userId);
    this.assertTransitionAllowed(
      post.status as CommunityPostStatus,
      'SCHEDULED',
    );

    const scheduledAt = new Date(dto.scheduledAt);
    if (Number.isNaN(scheduledAt.getTime())) {
      throw new BadRequestException('scheduledAt is not a valid date');
    }
    if (scheduledAt.getTime() <= Date.now()) {
      throw new BadRequestException(
        'Pick a time in the future, or publish the post now instead',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      const { count } = await this.postRepo.updateMany(
        {
          where: { id, status: 'APPROVED' },
          data: { status: 'SCHEDULED', scheduledAt },
        },
        { prisma: tx as unknown as TQueryClient },
      );
      if (count !== 1) {
        throw new BadRequestException('This post is no longer approved');
      }

      await this.writeLog(
        {
          postId: id,
          action: 'SCHEDULE',
          fromStatus: 'APPROVED',
          toStatus: 'SCHEDULED',
          actor: { userId: dto.userId, type: 'USER' },
          metadata: { scheduledAt: scheduledAt.toISOString() },
        },
        tx as unknown as TQueryClient,
      );
    });

    return this.findOne(id);
  }

  /**
   * ยกเลิกตารางเวลา — กลับไปเป็น APPROVED เพื่อรอเผยแพร่ด้วยมือ
   *
   * @param id id ของโพสต์
   * @param userId ผู้ยกเลิก (ต้องเป็น OWNER/ADMIN)
   * @returns โพสต์หลังยกเลิก
   * @throws BadRequestException เมื่อสถานะไม่ใช่ SCHEDULED
   */
  async unschedule(id: string, userId: string) {
    const post = await this.getOrFail(id);
    await this.assertApprover(post.organizationId, userId);
    this.assertTransitionAllowed(
      post.status as CommunityPostStatus,
      'APPROVED',
    );

    await this.prisma.$transaction(async (tx) => {
      const { count } = await this.postRepo.updateMany(
        {
          where: { id, status: 'SCHEDULED' },
          data: { status: 'APPROVED', scheduledAt: null },
        },
        { prisma: tx as unknown as TQueryClient },
      );
      if (count !== 1) {
        throw new BadRequestException(
          'This post is no longer scheduled — it may have just been published',
        );
      }

      await this.writeLog(
        {
          postId: id,
          action: 'UNSCHEDULE',
          fromStatus: 'SCHEDULED',
          toStatus: 'APPROVED',
          actor: { userId, type: 'USER' },
        },
        tx as unknown as TQueryClient,
      );
    });

    return this.findOne(id);
  }

  /**
   * ถอดโพสต์ออกจากหน้าสาธารณะ (takedown)
   *
   * ไม่ลบแถวทิ้ง — ยอดวิว/ไลก์และ log ต้องอยู่ครบเพื่อตอบคำถามย้อนหลังได้ว่า
   * เคยมีอะไรเผยแพร่ไปบ้างและใครเป็นคนถอด
   *
   * @param id id ของโพสต์
   * @param dto ผู้ถอด + เหตุผล
   * @returns โพสต์หลังถอด
   * @throws BadRequestException เมื่อโพสต์ยังไม่เคยเผยแพร่
   */
  async unpublish(id: string, dto: UnpublishCommunityPostDto) {
    const post = await this.getOrFail(id);
    await this.assertApprover(post.organizationId, dto.userId);
    this.assertTransitionAllowed(
      post.status as CommunityPostStatus,
      'UNPUBLISHED',
    );

    await this.prisma.$transaction(async (tx) => {
      const { count } = await this.postRepo.updateMany(
        {
          where: { id, status: 'PUBLISHED' },
          data: { status: 'UNPUBLISHED', unpublishedAt: new Date() },
        },
        { prisma: tx as unknown as TQueryClient },
      );
      if (count !== 1) {
        throw new BadRequestException('This post is not currently published');
      }

      await this.writeLog(
        {
          postId: id,
          action: 'UNPUBLISH',
          fromStatus: 'PUBLISHED',
          toStatus: 'UNPUBLISHED',
          actor: { userId: dto.userId, type: 'USER' },
          note: dto.reason ?? null,
        },
        tx as unknown as TQueryClient,
      );
    });

    this.mirrorToAuditLog(
      dto.userId,
      'UPDATE',
      id,
      { status: 'PUBLISHED' },
      { status: 'UNPUBLISHED', reason: dto.reason ?? null },
    );
    return this.findOne(id);
  }

  /**
   * นำโพสต์ที่ถอดไปแล้วกลับขึ้นหน้าสาธารณะ
   *
   * @param id id ของโพสต์
   * @param userId ผู้กด (ต้องเป็น OWNER/ADMIN)
   * @returns โพสต์หลังนำกลับ
   * @throws BadRequestException เมื่อสถานะไม่ใช่ UNPUBLISHED
   */
  async republish(id: string, userId: string) {
    const post = await this.getOrFail(id);
    await this.assertApprover(post.organizationId, userId);
    this.assertTransitionAllowed(
      post.status as CommunityPostStatus,
      'PUBLISHED',
    );

    await this.prisma.$transaction(async (tx) => {
      const { count } = await this.postRepo.updateMany(
        {
          where: { id, status: 'UNPUBLISHED' },
          data: { status: 'PUBLISHED', unpublishedAt: null },
        },
        { prisma: tx as unknown as TQueryClient },
      );
      if (count !== 1) {
        throw new BadRequestException('This post is not currently unpublished');
      }

      await this.writeLog(
        {
          postId: id,
          action: 'REPUBLISH',
          fromStatus: 'UNPUBLISHED',
          toStatus: 'PUBLISHED',
          actor: { userId, type: 'USER' },
        },
        tx as unknown as TQueryClient,
      );
    });

    return this.findOne(id);
  }

  /**
   * เผยแพร่โพสต์ทุกใบที่ตั้งเวลาไว้และถึงกำหนดแล้ว (เรียกจาก cron)
   *
   * ไล่ทีละใบแทนการ updateMany ก้อนเดียว เพราะทุก transition ต้องมีแถว log คู่กัน
   * และโพสต์ใบหนึ่งพังต้องไม่ทำให้ใบที่เหลือไม่ได้เผยแพร่
   *
   * กัน cron หลาย pod ชนกันด้วยเงื่อนไข status ใน where ของ updateMany —
   * pod ที่มาทีหลังจะได้ count === 0 แล้วข้ามใบนั้นไปเงียบ ๆ
   *
   * @param now เวลาอ้างอิง (รับเข้ามาเพื่อให้เทสต์กำหนดเองได้)
   * @param graceMinutes ไม่หยิบโพสต์ที่เลยกำหนดมานานกว่านี้
   * @param batchSize จำนวนสูงสุดต่อรอบ
   * @returns จำนวนที่เผยแพร่สำเร็จและจำนวนที่ข้าม
   */
  async publishDueScheduled(
    now: Date,
    graceMinutes: number,
    batchSize: number,
  ): Promise<{ published: number; skipped: number }> {
    const earliest = new Date(now.getTime() - graceMinutes * 60_000);

    const due = await this.postRepo.findMany({
      where: {
        status: 'SCHEDULED',
        scheduledAt: { lte: now, gte: earliest },
      },
      orderBy: { scheduledAt: 'asc' },
      take: batchSize,
    });

    let published = 0;
    let skipped = 0;

    for (const post of due) {
      try {
        await this.prisma.$transaction(async (tx) => {
          const { count } = await this.postRepo.updateMany(
            {
              where: { id: post.id, status: 'SCHEDULED' },
              data: { status: 'PUBLISHED', publishedAt: now, scheduledAt: null },
            },
            { prisma: tx as unknown as TQueryClient },
          );
          // อีก pod หยิบไปแล้ว — ไม่ใช่ error
          if (count !== 1) {
            skipped += 1;
            return;
          }

          await this.writeLog(
            {
              postId: post.id,
              action: 'PUBLISH',
              fromStatus: 'SCHEDULED',
              toStatus: 'PUBLISHED',
              actor: { userId: null, type: 'SYSTEM' },
              metadata: {
                scheduledAt: post.scheduledAt?.toISOString() ?? null,
              },
            },
            tx as unknown as TQueryClient,
          );
          published += 1;
        });
      } catch (error) {
        // โพสต์ใบเดียวพังต้องไม่หยุดทั้ง batch — รอบถัดไปจะหยิบใบนี้ขึ้นมาใหม่
        // ตราบใดที่ยังอยู่ในช่วง grace
        skipped += 1;
        this.logger.error(
          `scheduled publish failed for community_post ${post.id}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    return { published, skipped };
  }

  /**
   * โพสต์ที่เลยกำหนดเผยแพร่จนพ้นช่วง grace ไปแล้ว
   *
   * เกิดได้เมื่อ service ดับข้ามคืน — จงใจไม่เผยแพร่ย้อนหลังให้อัตโนมัติ เพราะ
   * เนื้อหาที่ตั้งเวลาไว้เมื่อวานอาจไม่เหมาะจะขึ้นวันนี้แล้ว ให้แอดมินตัดสินใจเอง
   *
   * @param organizationId org ที่สนใจ
   * @param graceMinutes ช่วงเวลาเดียวกับที่ cron ใช้
   * @returns โพสต์ที่ค้างอยู่
   */
  async findStaleScheduled(organizationId: string, graceMinutes: number) {
    const earliest = new Date(Date.now() - graceMinutes * 60_000);
    return this.postRepo.findMany({
      where: {
        organizationId,
        status: 'SCHEDULED',
        scheduledAt: { lt: earliest },
      },
      orderBy: { scheduledAt: 'asc' },
    });
  }

  /**
   * ลบโพสต์ที่ยังไม่เคยเผยแพร่
   *
   * ลบจริง (ไม่ soft delete) ตาม convention ของโปรเจกต์ — log และ reaction
   * จะถูกลบตามด้วย FK cascade
   *
   * @param id id ของโพสต์
   * @param userId ผู้ลบ (ต้องเป็นเจ้าของโพสต์)
   * @throws BadRequestException เมื่อสถานะลบไม่ได้แล้ว
   */
  async remove(id: string, userId: string) {
    const post = await this.getOrFail(id);
    this.assertOwner(post.createdByUserId, userId);

    if (!COMMUNITY_EDITABLE_STATUSES.includes(post.status as CommunityPostStatus)) {
      throw new BadRequestException(
        `A post in status ${post.status} can no longer be deleted — unpublish it instead`,
      );
    }

    await this.postRepo.delete({ where: { id } });
    this.mirrorToAuditLog(userId, 'DELETE', id, { status: post.status }, null);
    return { id };
  }

  // ==========================================================================
  // Queries
  // ==========================================================================

  /**
   * รายการโพสต์ของ org แบบแบ่งหน้า (มุมมอง studio — เห็นทุกสถานะ)
   *
   * @param query ตัวกรองและหน้า
   * @returns data + total สำหรับ server-side pagination
   */
  async findMany(query: ListCommunityPostDto) {
    const page = Number(query.page) > 0 ? Number(query.page) : 1;
    const pageSize = Number(query.pageSize) > 0 ? Number(query.pageSize) : 12;

    const where: Prisma.CommunityPostWhereInput = {
      organizationId: query.organizationId,
      ...(query.projectId && { projectId: query.projectId }),
      ...(query.status && { status: query.status }),
      ...(query.createdByUserId && { createdByUserId: query.createdByUserId }),
      ...(query.search && {
        OR: [
          { title: { contains: query.search, mode: 'insensitive' } },
          { caption: { contains: query.search, mode: 'insensitive' } },
        ],
      }),
    };

    const orderBy: Prisma.CommunityPostOrderByWithRelationInput[] =
      query.sort === 'popular'
        ? [{ viewCount: 'desc' }, { likeCount: 'desc' }]
        : [{ createdAt: 'desc' }];

    const [rows, total] = await Promise.all([
      this.postRepo.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy,
      }),
      this.postRepo.count({ where }),
    ]);

    const data = await Promise.all(
      rows.map(async (row) => ({
        ...row,
        // การ์ดในหน้า list ต้องการแค่รูปตัวอย่างใบแรก ไม่ต้อง presign ทุกไฟล์
        previewUrl: await this.resolvePreviewUrl(row.mediaItems),
        mediaCount: this.readMediaItems(row.mediaItems).length,
      })),
    );

    return { data, total, page, pageSize };
  }

  /**
   * รายละเอียดโพสต์ 1 ใบ พร้อมไทม์ไลน์ log (มุมมอง studio)
   *
   * @param id id ของโพสต์
   * @returns โพสต์พร้อมสื่อที่ presign เป็น URL แล้ว
   * @throws NotFoundException เมื่อไม่พบโพสต์
   */
  async findOne(id: string) {
    // เรียก prisma ตรงแทน repository เพราะ signature ของ repo รับ Prisma.XxxArgs แบบ
    // ไม่ generic ทำให้ type ของ include (logs) หายไป — read path ที่ต้องอ่าน relation
    // ต่อจึงใช้ client ตรงเพื่อคง type ไว้
    const post = await this.prisma.communityPost.findUnique({
      where: { id },
      include: { logs: { orderBy: { createdAt: 'asc' } } },
    });
    if (!post) {
      throw new NotFoundException('Community post not found');
    }

    const media = await Promise.all(
      this.readMediaItems(post.mediaItems).map(async (item) => ({
        ...item,
        url: await this.storageUrl.toDisplayUrl(item.resultKey),
        thumbnailUrl: await this.storageUrl.toDisplayUrl(
          item.thumbnailKey ?? item.resultKey,
        ),
      })),
    );

    return { ...post, media };
  }

  /**
   * จำนวนโพสต์ที่รออนุมัติของ org — ใช้แสดง badge บนแท็บ Approvals
   *
   * @param organizationId org ที่สนใจ
   * @returns จำนวนโพสต์สถานะ NEW
   */
  async countPendingApproval(organizationId: string) {
    const count = await this.postRepo.count({
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
   * @param id id ของโพสต์
   * @param dto ผู้รีวิว + โน้ต
   * @param toStatus สถานะปลายทาง
   * @param action action ที่จะบันทึกลง log
   * @returns โพสต์หลังรีวิว
   */
  private async review(
    id: string,
    dto: ReviewCommunityPostDto,
    toStatus: CommunityPostStatus,
    action: CommunityPostAction,
  ) {
    const post = await this.getOrFail(id);
    await this.assertApprover(post.organizationId, dto.userId);
    this.assertTransitionAllowed(post.status as CommunityPostStatus, toStatus);

    await this.prisma.$transaction(async (tx) => {
      const { count } = await this.postRepo.updateMany(
        {
          where: { id, status: post.status },
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
          'This post was already reviewed by someone else',
        );
      }

      await this.writeLog(
        {
          postId: id,
          action,
          fromStatus: post.status,
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
      { status: post.status },
      { status: toStatus, reviewNote: dto.reviewNote ?? null },
    );
    return this.findOne(id);
  }

  /**
   * เขียนแถว community_post_log
   *
   * ทุก transition ต้องเรียกผ่านที่นี่ และต้องอยู่ใน transaction เดียวกับการอัปเดต
   * สถานะเสมอ — ไม่งั้น log กับสถานะจริงจะไม่ตรงกันเมื่อมีอะไรพังกลางทาง
   *
   * @param entry ข้อมูล log
   * @param tx transaction client
   */
  private async writeLog(
    entry: {
      postId: string;
      action: CommunityPostAction;
      fromStatus: string | null;
      toStatus: string;
      actor: Actor;
      note?: string | null;
      metadata?: Prisma.InputJsonValue;
    },
    tx: TQueryClient,
  ): Promise<void> {
    await this.postLogRepo.create(
      {
        data: {
          postId: entry.postId,
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
    from: CommunityPostStatus,
    to: CommunityPostStatus,
  ): void {
    if (!COMMUNITY_ALLOWED_TRANSITIONS[from]?.includes(to)) {
      throw new BadRequestException(`Cannot move a post from ${from} to ${to}`);
    }
  }

  /**
   * แปลง gallery id ที่ผู้ใช้เลือกเป็น snapshot ของ object key
   *
   * ตรวจด้วยว่าทุกชิ้นอยู่ใน project เดียวกับโพสต์ — กันการอ้าง gallery ข้าม project
   * (ซึ่งบนหน้า studio ที่เลือก project ได้อิสระ เป็นทางที่ข้อมูลข้ามองค์กรจะรั่วได้จริง)
   *
   * หมายเหตุ: gallery เก็บแค่ "ชื่อไฟล์" ไม่ใช่ key เต็ม — ที่นี่จึงประกอบ key เต็ม
   * ด้วย buildOutputKey แล้วเก็บลง snapshot เพื่อให้หน้า public ใช้ได้โดยไม่ต้องรู้
   * context ของ project อีก
   *
   * @param items รายการที่เลือกจาก frontend
   * @param projectId project ของโพสต์
   * @param organizationId org ของโพสต์ (ใช้ประกอบ key)
   * @returns snapshot ที่พร้อมเก็บลง media_items + prompt ของสื่อชิ้นแรก
   * @throws BadRequestException เมื่อมี id ที่ไม่พบ ไม่อยู่ใน project หรือยังไม่มีไฟล์ผลลัพธ์
   */
  private async resolveMediaItems(
    items: CommunityMediaItemDto[],
    projectId: string,
    organizationId: string,
  ): Promise<{ mediaItems: CommunityMediaItem[]; prompt: string | null }> {
    if (items.length === 0 || items.length > MAX_MEDIA_PER_COMMUNITY_POST) {
      throw new BadRequestException(
        `Select between 1 and ${MAX_MEDIA_PER_COMMUNITY_POST} items`,
      );
    }

    const galleryIds = items.map((item) => item.galleryId);
    const rows = await this.galleryRepo.findMany({
      where: { id: { in: galleryIds }, projectId },
    });

    const byId = new Map(rows.map((row) => [row.id, row]));
    const mediaItems = items.map((item, index) => {
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

    // prompt ของสื่อชิ้นแรกเป็นตัวแทนของโพสต์ — โพสต์ที่รวมหลาย generation
    // ไม่มี prompt เดียวที่ถูกต้อง จึงไม่พยายามเดารวม
    const firstRow = byId.get(items[0].galleryId);
    return { mediaItems, prompt: firstRow?.prompt ?? null };
  }

  /**
   * หาชื่อผู้เขียนและชื่อองค์กรสำหรับ denormalize ลงโพสต์
   *
   * ค่าเหล่านี้ถูกตรึงไว้ตั้งแต่ตอนสร้าง เพื่อให้หน้า public ไม่ต้อง join และเพื่อให้
   * เครดิตบนโพสต์ที่เผยแพร่ไปแล้วไม่เปลี่ยนตามการแก้โปรไฟล์ภายหลัง
   *
   * @param organizationId org ของโพสต์
   * @param userId ผู้สร้างโพสต์
   * @returns ชื่อที่จะแสดงบนหน้า public
   */
  private async resolveAttribution(
    organizationId: string,
    userId: string,
  ): Promise<{ authorDisplayName: string; organizationDisplayName: string }> {
    const [user, organization] = await Promise.all([
      this.usersRepo.findOne({ where: { userId } }),
      this.orgRepo.findOne({ where: { organizationId } }),
    ]);

    return {
      authorDisplayName: user?.fullname?.trim() || user?.username || 'AI CAVE',
      organizationDisplayName: organization?.name?.trim() || '',
    };
  }

  /**
   * สรุป field ที่เปลี่ยนสำหรับเก็บลง log
   *
   * @param post แถวก่อนแก้
   * @param dto ค่าที่ส่งมาแก้
   * @param mediaItems สื่อหลังแก้ (null = ไม่เปลี่ยน)
   * @returns before/after ของเฉพาะ field ที่เปลี่ยนจริง
   */
  private buildDiff(
    post: {
      title: string;
      caption: string;
      hashtags: string[];
      linkUrl: string | null;
      showPrompt: boolean;
    },
    dto: UpdateCommunityPostDto,
    mediaItems: CommunityMediaItem[] | null,
  ): { before: Record<string, unknown>; after: Record<string, unknown> } {
    const before: Record<string, unknown> = {};
    const after: Record<string, unknown> = {};

    if (dto.title !== undefined && dto.title !== post.title) {
      before.title = post.title;
      after.title = dto.title;
    }
    if (dto.caption !== undefined && dto.caption !== post.caption) {
      before.caption = post.caption;
      after.caption = dto.caption;
    }
    if (dto.hashtags !== undefined) {
      before.hashtags = post.hashtags;
      after.hashtags = dto.hashtags;
    }
    if (dto.linkUrl !== undefined && dto.linkUrl !== post.linkUrl) {
      before.linkUrl = post.linkUrl;
      after.linkUrl = dto.linkUrl;
    }
    if (dto.showPrompt !== undefined && dto.showPrompt !== post.showPrompt) {
      before.showPrompt = post.showPrompt;
      after.showPrompt = dto.showPrompt;
    }
    if (mediaItems) {
      after.mediaCount = mediaItems.length;
    }
    return { before, after };
  }

  /**
   * อ่านค่า media_items ดิบจาก DB ให้เป็น type ที่ใช้งานต่อได้
   *
   * @param mediaItems ค่า JSON ดิบ
   * @returns รายการสื่อ (array ว่างเมื่อไม่มี)
   */
  private readMediaItems(mediaItems: Prisma.JsonValue): CommunityMediaItem[] {
    return (mediaItems ?? []) as unknown as CommunityMediaItem[];
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
    const [first] = this.readMediaItems(mediaItems);
    if (!first) return null;
    return this.storageUrl.toDisplayUrl(first.thumbnailKey ?? first.resultKey);
  }

  /**
   * ดึงโพสต์หรือโยน 404
   *
   * @param id id ของโพสต์
   * @returns แถว community_post
   * @throws NotFoundException เมื่อไม่พบ
   */
  private async getOrFail(id: string) {
    const post = await this.postRepo.findUnique({ where: { id } });
    if (!post) {
      throw new NotFoundException('Community post not found');
    }
    return post;
  }

  /**
   * ตรวจว่าเป็นเจ้าของโพสต์
   *
   * @param ownerUserId เจ้าของโพสต์
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
      throw new ForbiddenException('You are not a member of this organization');
    }
  }

  /**
   * ตรวจว่าเป็น OWNER/ADMIN ของ org (สิทธิ์อนุมัติและเผยแพร่)
   *
   * การเผยแพร่ขึ้นหน้าสาธารณะใช้สิทธิ์ระดับเดียวกับการอนุมัติโดยตั้งใจ — เนื้อหา
   * ที่ออกนอกองค์กรต้องผ่านคนที่รับผิดชอบแทนองค์กรได้เสมอ
   *
   * @param organizationId org ของโพสต์
   * @param userId ผู้กระทำ
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
        'Only an organization OWNER or ADMIN can review or publish community posts',
      );
    }
  }

  /**
   * บันทึกลง audit_logs กลางของระบบด้วย
   *
   * community_post_log คือไทม์ไลน์ที่ผู้ใช้เห็นในหน้าจอ ส่วน audit_logs คือหลักฐาน
   * เชิง compliance ข้ามโดเมน — จงใจเขียนทั้งคู่ (แนวเดียวกับ activity-share)
   *
   * ยิงแบบ fire-and-forget: audit ที่พังต้องไม่ทำให้คำสั่งหลักที่สำเร็จไปแล้ว
   * กลายเป็น error
   *
   * @param userId ผู้กระทำ
   * @param action ชนิด action ของ audit log
   * @param entityId id ของโพสต์
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
      .logAudit(userId, action, 'community_post', entityId, oldValues, newValues)
      .catch((error) => {
        this.logger.warn(
          `audit log failed for community_post ${entityId}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      });
  }
}
