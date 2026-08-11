import { Injectable } from '@nestjs/common';
import {
  PublishError,
  PublishInput,
  PublishResult,
  SocialPlatform,
  SocialPublisher,
} from '@ai-media/share';
import { requestJson } from './provider-http.util';

/**
 * เผยแพร่ลง Facebook Page ผ่าน Graph API
 *
 * ใช้วิธีให้ Facebook ไป pull ไฟล์จาก presigned URL เอง (`url` / `file_url`)
 * แทนการอัปโหลด multipart — ประหยัด memory ของ worker และเป็นวิธีที่ Meta แนะนำ
 */
@Injectable()
export class FacebookPublisher implements SocialPublisher {
  readonly platform: SocialPlatform = 'FACEBOOK';

  private get graphBase(): string {
    const version = process.env.META_GRAPH_API_VERSION || 'v21.0';
    return `https://graph.facebook.com/${version}`;
  }

  async publish(input: PublishInput): Promise<PublishResult> {
    const { account, media } = input;
    if (media.length === 0) {
      throw new PublishError('facebook.no_media', 'No media to publish', false);
    }

    const message = this.composeMessage(input);
    const videos = media.filter((item) => item.isVideo);

    if (videos.length > 0) {
      if (media.length > 1) {
        throw new PublishError(
          'facebook.mixed_media',
          'Facebook accepts only one video per post',
          false,
        );
      }
      return this.publishVideo(account.externalId, account.accessToken, {
        message,
        fileUrl: videos[0].url,
      });
    }

    if (media.length === 1) {
      return this.publishSinglePhoto(account.externalId, account.accessToken, {
        message,
        url: media[0].url,
      });
    }
    return this.publishPhotoAlbum(account.externalId, account.accessToken, {
      message,
      urls: media.map((item) => item.url),
    });
  }

  /**
   * รวม caption + hashtag + link เป็นข้อความเดียว
   *
   * Facebook ไม่มี field hashtag แยก จึงต่อท้ายข้อความ
   *
   * @param input เนื้อหาของโพสต์
   * @returns ข้อความที่พร้อมโพสต์
   */
  private composeMessage(input: PublishInput): string {
    const parts = [input.caption.trim()];
    if (input.hashtags.length > 0) {
      parts.push(input.hashtags.map((tag) => `#${tag.replace(/^#/, '')}`).join(' '));
    }
    if (input.linkUrl) parts.push(input.linkUrl);
    return parts.filter(Boolean).join('\n\n');
  }

  /**
   * โพสต์รูปเดียวพร้อมข้อความ
   *
   * @param pageId Page id
   * @param token Page access token
   * @param payload ข้อความและ URL ของรูป
   * @returns id/url ของโพสต์
   */
  private async publishSinglePhoto(
    pageId: string,
    token: string,
    payload: { message: string; url: string },
  ): Promise<PublishResult> {
    const body = new URLSearchParams({
      url: payload.url,
      caption: payload.message,
      published: 'true',
      access_token: token,
    });
    const result = await requestJson<{ id: string; post_id?: string }>(
      'facebook.photos',
      `${this.graphBase}/${pageId}/photos`,
      { method: 'POST', body },
    );
    const postId = result.post_id ?? result.id;
    return {
      remotePostId: postId,
      remoteUrl: `https://www.facebook.com/${postId}`,
    };
  }

  /**
   * โพสต์หลายรูปเป็นอัลบั้มเดียว
   *
   * ต้องอัปโหลดรูปแบบ unpublished ก่อนเพื่อเอา id มาผูกกับ feed post ทีเดียว —
   * ถ้าโพสต์ทีละรูปจะกลายเป็นหลายโพสต์แยกกันบนหน้า Page
   *
   * @param pageId Page id
   * @param token Page access token
   * @param payload ข้อความและ URL ของรูปทั้งหมด
   * @returns id/url ของโพสต์
   */
  private async publishPhotoAlbum(
    pageId: string,
    token: string,
    payload: { message: string; urls: string[] },
  ): Promise<PublishResult> {
    const mediaFbids: { media_fbid: string }[] = [];
    for (const url of payload.urls) {
      const uploaded = await requestJson<{ id: string }>(
        'facebook.photos.unpublished',
        `${this.graphBase}/${pageId}/photos`,
        {
          method: 'POST',
          body: new URLSearchParams({
            url,
            published: 'false',
            access_token: token,
          }),
        },
      );
      mediaFbids.push({ media_fbid: uploaded.id });
    }

    const post = await requestJson<{ id: string }>(
      'facebook.feed',
      `${this.graphBase}/${pageId}/feed`,
      {
        method: 'POST',
        body: new URLSearchParams({
          message: payload.message,
          attached_media: JSON.stringify(mediaFbids),
          access_token: token,
        }),
      },
    );
    return {
      remotePostId: post.id,
      remoteUrl: `https://www.facebook.com/${post.id}`,
    };
  }

  /**
   * โพสต์วิดีโอ
   *
   * @param pageId Page id
   * @param token Page access token
   * @param payload ข้อความและ URL ของวิดีโอ
   * @returns id/url ของโพสต์
   */
  private async publishVideo(
    pageId: string,
    token: string,
    payload: { message: string; fileUrl: string },
  ): Promise<PublishResult> {
    const result = await requestJson<{ id: string }>(
      'facebook.videos',
      `${this.graphBase}/${pageId}/videos`,
      {
        method: 'POST',
        body: new URLSearchParams({
          file_url: payload.fileUrl,
          description: payload.message,
          access_token: token,
        }),
      },
    );
    return {
      remotePostId: result.id,
      remoteUrl: `https://www.facebook.com/${result.id}`,
    };
  }
}
