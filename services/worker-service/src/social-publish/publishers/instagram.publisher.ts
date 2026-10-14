import { Injectable, Logger } from '@nestjs/common';
import {
  PublishError,
  PublishInput,
  PublishResult,
  ResolvedMedia,
  SocialPlatform,
  SocialPublisher,
} from '@ai-media/share';
import { delay, requestJson } from './provider-http.util';

/** Reels ใช้เวลา transcode นานกว่ารูปมาก จึงต้องรอได้นานพอ */
const CONTAINER_POLL_INTERVAL_MS = 3000;
const CONTAINER_POLL_TIMEOUT_MS = 5 * 60 * 1000;

interface ContainerStatus {
  status_code: 'EXPIRED' | 'ERROR' | 'FINISHED' | 'IN_PROGRESS' | 'PUBLISHED';
  status?: string;
}

/**
 * เผยแพร่ลง Instagram Business ผ่าน Graph API
 *
 * ข้อจำกัดสำคัญ: IG ไม่รับอัปโหลดไฟล์ตรง ต้องส่ง URL ที่ "เข้าถึงได้แบบสาธารณะ"
 * ให้ IG ไป pull เอง — presigned URL ของ TOS ใช้ได้ แต่อายุต้องยาวพอที่ IG จะดึงทัน
 * (Reels อาจใช้เวลาหลายนาที)
 */
@Injectable()
export class InstagramPublisher implements SocialPublisher {
  readonly platform: SocialPlatform = 'INSTAGRAM';
  private readonly logger = new Logger(InstagramPublisher.name);

  private get graphBase(): string {
    const version = process.env.META_GRAPH_API_VERSION || 'v21.0';
    return `https://graph.facebook.com/${version}`;
  }

  async publish(input: PublishInput): Promise<PublishResult> {
    const { account, media } = input;
    if (media.length === 0) {
      throw new PublishError('instagram.no_media', 'No media to publish', false);
    }

    const caption = this.composeCaption(input);
    const creationId =
      media.length === 1
        ? await this.createSingleContainer(account, media[0], caption)
        : await this.createCarouselContainer(account, media, caption);

    await this.waitForContainer(account.externalId, account.accessToken, creationId);

    const published = await requestJson<{ id: string }>(
      'instagram.media_publish',
      `${this.graphBase}/${account.externalId}/media_publish`,
      {
        method: 'POST',
        body: new URLSearchParams({
          creation_id: creationId,
          access_token: account.accessToken,
        }),
      },
    );

    return {
      remotePostId: published.id,
      // permalink ต้องเรียกเพิ่มอีก request — ข้ามไปเพื่อประหยัด quota,
      // frontend แสดงลิงก์จาก remotePostId ไม่ได้อยู่แล้วถ้าไม่มี shortcode
      remoteUrl: null,
    };
  }

  /**
   * รวม caption กับ hashtag (IG นับ hashtag รวมในโควตา 2200 ตัวอักษร)
   *
   * @param input เนื้อหาของโพสต์
   * @returns caption ที่พร้อมโพสต์
   */
  private composeCaption(input: PublishInput): string {
    const parts = [input.caption.trim()];
    if (input.hashtags.length > 0) {
      parts.push(
        input.hashtags.map((tag) => `#${tag.replace(/^#/, '')}`).join(' '),
      );
    }
    return parts.filter(Boolean).join('\n\n');
  }

  /**
   * สร้าง container สำหรับสื่อชิ้นเดียว (รูป feed หรือ Reels)
   *
   * @param account บัญชี IG
   * @param item สื่อที่จะโพสต์
   * @param caption caption
   * @returns creation id ของ container
   */
  private async createSingleContainer(
    account: { externalId: string; accessToken: string },
    item: ResolvedMedia,
    caption: string,
  ): Promise<string> {
    const body = new URLSearchParams({
      caption,
      access_token: account.accessToken,
      ...(item.isVideo
        ? { video_url: item.url, media_type: 'REELS' }
        : { image_url: item.url }),
    });
    const container = await requestJson<{ id: string }>(
      'instagram.media',
      `${this.graphBase}/${account.externalId}/media`,
      { method: 'POST', body },
    );
    return container.id;
  }

  /**
   * สร้าง container แบบ carousel — ต้องสร้าง child container ทีละชิ้นก่อน
   *
   * @param account บัญชี IG
   * @param media สื่อทั้งหมด
   * @param caption caption
   * @returns creation id ของ carousel container
   */
  private async createCarouselContainer(
    account: { externalId: string; accessToken: string },
    media: readonly ResolvedMedia[],
    caption: string,
  ): Promise<string> {
    const childIds: string[] = [];
    for (const item of media) {
      const child = await requestJson<{ id: string }>(
        'instagram.media.child',
        `${this.graphBase}/${account.externalId}/media`,
        {
          method: 'POST',
          body: new URLSearchParams({
            is_carousel_item: 'true',
            access_token: account.accessToken,
            ...(item.isVideo
              ? { video_url: item.url, media_type: 'VIDEO' }
              : { image_url: item.url }),
          }),
        },
      );
      childIds.push(child.id);
    }

    const carousel = await requestJson<{ id: string }>(
      'instagram.media.carousel',
      `${this.graphBase}/${account.externalId}/media`,
      {
        method: 'POST',
        body: new URLSearchParams({
          media_type: 'CAROUSEL',
          children: childIds.join(','),
          caption,
          access_token: account.accessToken,
        }),
      },
    );
    return carousel.id;
  }

  /**
   * รอจน container พร้อมเผยแพร่
   *
   * ต้อง poll เพราะ IG transcode แบบ async — ถ้ายิง media_publish ทันทีจะได้ error
   * ที่อ่านไม่รู้เรื่อง มี timeout กันไม่ให้ job ค้างคิวตลอดไป
   *
   * @param igUserId IG user id
   * @param token access token
   * @param creationId container ที่จะรอ
   * @throws PublishError เมื่อ container error, หมดอายุ หรือรอเกินเวลา
   */
  private async waitForContainer(
    igUserId: string,
    token: string,
    creationId: string,
  ): Promise<void> {
    const deadline = Date.now() + CONTAINER_POLL_TIMEOUT_MS;

    while (Date.now() < deadline) {
      const result = await requestJson<ContainerStatus>(
        'instagram.container_status',
        `${this.graphBase}/${creationId}?fields=status_code,status&access_token=${token}`,
      );

      if (result.status_code === 'FINISHED') return;
      if (result.status_code === 'ERROR' || result.status_code === 'EXPIRED') {
        throw new PublishError(
          `instagram.container_${result.status_code.toLowerCase()}`,
          `Instagram rejected the media: ${result.status ?? result.status_code}`,
          false,
          result,
        );
      }
      await delay(CONTAINER_POLL_INTERVAL_MS);
    }

    this.logger.warn(
      `instagram container ${creationId} for ${igUserId} did not finish in time`,
    );
    throw new PublishError(
      'instagram.container_timeout',
      'Instagram did not finish processing the media in time',
      true,
    );
  }
}
