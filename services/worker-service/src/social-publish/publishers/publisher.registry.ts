import { Injectable } from '@nestjs/common';
import { PublishError, SocialPlatform, SocialPublisher } from '@ai-media/share';
import { FacebookPublisher } from './facebook.publisher';
import { InstagramPublisher } from './instagram.publisher';
import { TikTokPublisher } from './tiktok.publisher';
import { YouTubePublisher } from './youtube.publisher';

/**
 * หา publisher ตาม platform
 *
 * เป็นจุดเดียวที่ผูก platform เข้ากับ implementation — เพิ่ม platform ใหม่
 * แก้แค่ที่นี่กับ SOCIAL_PLATFORMS
 */
@Injectable()
export class PublisherRegistry {
  private readonly registry: ReadonlyMap<SocialPlatform, SocialPublisher>;

  constructor(
    facebook: FacebookPublisher,
    instagram: InstagramPublisher,
    tiktok: TikTokPublisher,
    youtube: YouTubePublisher,
  ) {
    this.registry = new Map<SocialPlatform, SocialPublisher>([
      ['FACEBOOK', facebook],
      ['INSTAGRAM', instagram],
      ['TIKTOK', tiktok],
      ['YOUTUBE', youtube],
    ]);
  }

  /**
   * คืน publisher ของ platform
   *
   * @param platform platform ที่ต้องการ
   * @returns publisher
   * @throws PublishError เมื่อไม่มี publisher รองรับ (ไม่ retryable — retry ไม่ช่วย)
   */
  get(platform: SocialPlatform): SocialPublisher {
    const publisher = this.registry.get(platform);
    if (!publisher) {
      throw new PublishError(
        'platform.unsupported',
        `No publisher registered for ${platform}`,
        false,
      );
    }
    return publisher;
  }
}
