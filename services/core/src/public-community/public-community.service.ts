import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  COMMUNITY_FEED_PAGE_SIZE,
  COMMUNITY_PUBLIC_STATUS,
  CommunityMediaItem,
  CommunityPostReactionRepository,
  CommunityPostRepository,
  PrismaService,
  PublicCommunityMedia,
  PublicCommunityPost,
  StorageUrlService,
  VIDEO_GENERATE_TYPES,
  hashVisitorId,
} from '@ai-media/share';
import { PublicFeedQueryDto } from './dto/public-community.dto';

/** แถวจาก DB ที่ toPublicView ต้องใช้ — ตั้งใจไม่รับทั้ง entity เพื่อกันการเผลอส่งต่อ */
type PostRow = Prisma.CommunityPostGetPayload<Record<string, never>>;

@Injectable()
export class PublicCommunityService {
  private readonly logger = new Logger(PublicCommunityService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly postRepo: CommunityPostRepository,
    private readonly reactionRepo: CommunityPostReactionRepository,
    private readonly storageUrl: StorageUrlService,
  ) {}

  /**
   * feed สาธารณะแบบแบ่งหน้า
   *
   * @param query การเรียงลำดับ แท็ก และหน้า
   * @param origin origin ที่ใช้ประกอบ URL ของสื่อ
   * @returns โพสต์ที่ผ่าน whitelist แล้ว + total
   */
  async findFeed(query: PublicFeedQueryDto, origin: string) {
    const page = Number(query.page) > 0 ? Number(query.page) : 1;
    const pageSize =
      Number(query.pageSize) > 0
        ? Math.min(Number(query.pageSize), COMMUNITY_FEED_PAGE_SIZE)
        : COMMUNITY_FEED_PAGE_SIZE;

    // status ถูกตรึงไว้ที่นี่และห้ามมาจาก query — ดู PublicFeedQueryDto
    const where: Prisma.CommunityPostWhereInput = {
      status: COMMUNITY_PUBLIC_STATUS,
      ...(query.tag && { hashtags: { has: query.tag } }),
    };

    const orderBy: Prisma.CommunityPostOrderByWithRelationInput[] =
      query.sort === 'popular'
        ? [{ likeCount: 'desc' }, { viewCount: 'desc' }, { publishedAt: 'desc' }]
        : [{ publishedAt: 'desc' }];

    const [rows, total] = await Promise.all([
      this.postRepo.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy,
      }),
      this.postRepo.count({ where }),
    ]);

    const data = rows.map((row) => this.toPublicView(row as PostRow, origin));
    return { data, total, page, pageSize };
  }

  /**
   * โพสต์ 1 ใบตาม slug
   *
   * @param slug slug สาธารณะ
   * @param origin origin ที่ใช้ประกอบ URL ของสื่อ
   * @returns โพสต์ที่ผ่าน whitelist แล้ว
   * @throws NotFoundException เมื่อไม่พบ หรือโพสต์ยังไม่เผยแพร่/ถูกถอดไปแล้ว
   */
  async findBySlug(slug: string, origin: string): Promise<PublicCommunityPost> {
    const post = await this.getPublishedOrFail(slug);
    return this.toPublicView(post, origin);
  }

  /**
   * presign สื่อ 1 ชิ้นสำหรับ endpoint redirect
   *
   * แยกจาก toPublicView โดยตั้งใจ: URL ที่ presign แล้วมีอายุจำกัด ถ้าฝังลงใน
   * payload ของหน้า feed ตรง ๆ crawler ที่ cache og:image ไว้จะได้ลิงก์เสียภายหลัง
   * endpoint นี้จึงคงที่ แล้ว 302 ไปหา URL ใหม่ทุกครั้งแทน
   *
   * @param slug slug สาธารณะ
   * @param index ลำดับสื่อในโพสต์
   * @param thumbnail ขอ thumbnail แทนไฟล์เต็มหรือไม่
   * @returns presigned URL
   * @throws NotFoundException เมื่อโพสต์ไม่เผยแพร่ หรือ index เกินจำนวนสื่อ
   */
  async resolveMediaUrl(
    slug: string,
    index: number,
    thumbnail: boolean,
  ): Promise<string> {
    const post = await this.getPublishedOrFail(slug);
    // ต้องเรียงแบบเดียวกับ toPublicMedia เป๊ะ ๆ — index ใน URL มาจากตำแหน่งใน
    // array ที่เรียงแล้ว ถ้าสองที่เรียงไม่เหมือนกันจะเสิร์ฟรูปผิดใบ
    const item = this.readOrderedMediaItems(post.mediaItems)[index];
    if (!item) {
      throw new NotFoundException('Media not found');
    }

    const key = thumbnail ? item.thumbnailKey ?? item.resultKey : item.resultKey;
    const url = await this.storageUrl.toDisplayUrl(key);
    if (!url) {
      throw new NotFoundException('Media not found');
    }
    return url;
  }

  /**
   * นับยอดวิว 1 ครั้ง
   *
   * การกันนับซ้ำอยู่ฝั่ง client (cookie 24 ชม.) โดยตั้งใจ — ตัวเลขนี้เป็นสัญญาณ
   * เชิงคร่าว ๆ ไม่ใช่ metric ที่ใช้เรียกเก็บเงิน การเก็บ log ต่อผู้เยี่ยมชมเพื่อ
   * ความแม่นยำจึงไม่คุ้มกับข้อมูลส่วนบุคคลที่ต้องเก็บเพิ่ม
   *
   * @param slug slug สาธารณะ
   * @returns ยอดวิวล่าสุด
   */
  async registerView(slug: string): Promise<{ viewCount: number }> {
    // updateMany + เงื่อนไข status กันการปั๊มยอดให้โพสต์ที่ถูกถอดไปแล้ว
    // และไม่โยน error เมื่อไม่เจอ เพราะฝั่ง client ยิงแบบ fire-and-forget
    const { count } = await this.postRepo.updateMany({
      where: { slug, status: COMMUNITY_PUBLIC_STATUS },
      data: { viewCount: { increment: 1 } },
    });
    if (count !== 1) {
      return { viewCount: 0 };
    }

    // เรียก prisma ตรงเพื่อคง type ของ select ไว้ — signature ของ repository
    // ไม่ generic จึงคืน entity เต็มเสมอ (เหตุผลเดียวกับ findOne ใน studio service)
    const post = await this.prisma.communityPost.findUnique({
      where: { slug },
      select: { viewCount: true },
    });
    return { viewCount: post?.viewCount ?? 0 };
  }

  /**
   * สลับสถานะถูกใจของผู้เยี่ยมชม 1 คน
   *
   * แถวใน community_post_reaction มีไว้ทำให้ idempotent อย่างเดียว ส่วน like_count
   * บนโพสต์คือค่าที่ใช้อ่านจริง — อัปเดตทั้งคู่ใน transaction เดียวเพื่อไม่ให้
   * ตัวเลขกับแถวหลุดจากกัน
   *
   * @param slug slug สาธารณะ
   * @param visitorId ตัวระบุผู้เยี่ยมชมจาก cookie (เก็บเป็น hash เท่านั้น)
   * @returns สถานะหลังสลับ + ยอดล่าสุด
   * @throws NotFoundException เมื่อโพสต์ไม่ได้เผยแพร่อยู่
   */
  async toggleLike(
    slug: string,
    visitorId: string,
  ): Promise<{ liked: boolean; likeCount: number }> {
    const post = await this.getPublishedOrFail(slug);
    const visitorHash = hashVisitorId(visitorId);

    return this.prisma.$transaction(async (tx) => {
      const { count: removed } = await tx.communityPostReaction.deleteMany({
        where: { postId: post.id, visitorHash },
      });

      if (removed > 0) {
        const updated = await tx.communityPost.update({
          where: { id: post.id },
          data: { likeCount: { decrement: 1 } },
          select: { likeCount: true },
        });
        return { liked: false, likeCount: Math.max(updated.likeCount, 0) };
      }

      await tx.communityPostReaction.create({
        data: { postId: post.id, visitorHash },
      });
      const updated = await tx.communityPost.update({
        where: { id: post.id },
        data: { likeCount: { increment: 1 } },
        select: { likeCount: true },
      });
      return { liked: true, likeCount: updated.likeCount };
    });
  }

  /**
   * ผู้เยี่ยมชมคนนี้เคยกดถูกใจโพสต์นี้ไว้หรือยัง
   *
   * @param slug slug สาธารณะ
   * @param visitorId ตัวระบุผู้เยี่ยมชมจาก cookie
   * @returns true เมื่อเคยกดไว้
   */
  async hasLiked(slug: string, visitorId: string): Promise<{ liked: boolean }> {
    const post = await this.postRepo.findUnique({ where: { slug } });
    if (!post || post.status !== COMMUNITY_PUBLIC_STATUS) {
      return { liked: false };
    }
    const reaction = await this.reactionRepo.findOne({
      where: { postId: post.id, visitorHash: hashVisitorId(visitorId) },
    });
    return { liked: Boolean(reaction) };
  }

  // ==========================================================================
  // Internals
  // ==========================================================================

  /**
   * จุดเดียวที่แถว community_post กลายเป็น payload สาธารณะ
   *
   * ทุก field ถูกเลือกมาทีละตัวโดยตั้งใจ ห้ามใช้ spread จาก entity เด็ดขาด —
   * การเพิ่มคอลัมน์ใหม่ใน schema ต้องไม่ทำให้ข้อมูลหลุดออกไปเองโดยไม่มีใครตัดสินใจ
   *
   * field ที่ห้ามหลุด: organizationId, projectId, createdByUserId, galleryId,
   * object key ของ TOS, reviewedByUserId, reviewNote และชื่อโมเดล AI
   *
   * @param post แถวจาก DB
   * @param origin origin ที่ใช้ประกอบ URL ของสื่อ
   * @returns payload ที่ปลอดภัยต่อการส่งออกภายนอก
   */
  private toPublicView(post: PostRow, origin: string): PublicCommunityPost {
    return {
      id: post.id,
      slug: post.slug,
      title: post.title,
      caption: post.caption,
      hashtags: post.hashtags,
      linkUrl: post.linkUrl,
      media: this.toPublicMedia(post.slug, post.mediaItems, origin),
      // prompt ออกไปได้เฉพาะเมื่อเจ้าของโพสต์เลือกเปิดเผยเอง
      prompt: post.showPrompt ? post.promptSnapshot : null,
      authorDisplayName: post.authorDisplayName,
      organizationDisplayName: post.organizationDisplayName,
      publishedAt: post.publishedAt,
      viewCount: post.viewCount,
      likeCount: post.likeCount,
    };
  }

  /**
   * แปลง snapshot ของสื่อเป็น URL สาธารณะที่คงที่
   *
   * @param slug slug ของโพสต์
   * @param mediaItems ค่า media_items ดิบ
   * @param origin origin ที่ใช้ประกอบ URL
   * @returns รายการสื่อที่ไม่มี object key และไม่มี galleryId ติดไปด้วย
   */
  private toPublicMedia(
    slug: string,
    mediaItems: Prisma.JsonValue,
    origin: string,
  ): PublicCommunityMedia[] {
    const base = `${origin}/api/public/community/${encodeURIComponent(slug)}/media`;
    return this.readOrderedMediaItems(mediaItems).map((item, index) => ({
        index,
        isVideo: VIDEO_GENERATE_TYPES.includes(item.typeGenerate),
        url: `${base}/${index}`,
        thumbnailUrl: `${base}/${index}?thumbnail=1`,
      }));
  }

  /**
   * ดึงโพสต์ที่เผยแพร่อยู่ หรือโยน 404
   *
   * โพสต์ที่ยังไม่อนุมัติ ตั้งเวลาไว้ หรือถูกถอดแล้ว ต้องได้ 404 เหมือนกันหมด —
   * ไม่แยก 403 ออกมา เพราะการแยกเองก็บอกใบ้ว่า slug นั้นมีอยู่จริง
   *
   * @param slug slug สาธารณะ
   * @returns แถว community_post
   * @throws NotFoundException เมื่อไม่พบหรือไม่ได้เผยแพร่
   */
  private async getPublishedOrFail(slug: string): Promise<PostRow> {
    const post = await this.postRepo.findOne({
      where: { slug, status: COMMUNITY_PUBLIC_STATUS },
    });
    if (!post) {
      throw new NotFoundException('Post not found');
    }
    return post as PostRow;
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
   * รายการสื่อที่เรียงตาม order แล้ว
   *
   * ทุกที่ที่อ้างสื่อด้วย "ตำแหน่งที่ index" ต้องผ่านฟังก์ชันนี้ที่เดียว — index ใน
   * URL สาธารณะกับ index ที่ใช้ค้นตอน redirect ต้องหมายถึงชิ้นเดียวกันเสมอ
   *
   * @param mediaItems ค่า JSON ดิบ
   * @returns สำเนาที่เรียงแล้ว (ไม่แก้ array เดิม)
   */
  private readOrderedMediaItems(
    mediaItems: Prisma.JsonValue,
  ): CommunityMediaItem[] {
    return this.readMediaItems(mediaItems)
      .slice()
      .sort((a, b) => a.order - b.order);
  }
}
