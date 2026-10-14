import { Injectable } from '@nestjs/common';
import {
  PublishError,
  PublishInput,
  PublishResult,
  SocialPlatform,
  SocialPublisher,
} from '@ai-media/share';
import { delay, downloadMedia, requestJson } from './provider-http.util';

const TIKTOK_API = 'https://open.tiktokapis.com/v2';
const STATUS_POLL_INTERVAL_MS = 3000;
const STATUS_POLL_TIMEOUT_MS = 5 * 60 * 1000;

interface InitResponse {
  data?: {
    publish_id?: string;
    upload_url?: string;
  };
  error?: { code?: string; message?: string };
}

interface StatusResponse {
  data?: {
    status?: 'PROCESSING_UPLOAD' | 'PUBLISH_COMPLETE' | 'FAILED' | string;
    publicaly_available_post_id?: string[];
    fail_reason?: string;
  };
}

/**
 * เผยแพร่วิดีโอลง TikTok ผ่าน Content Posting API
 *
 * ใช้ FILE_UPLOAD (ดาวน์โหลดไฟล์มาแล้ว PUT ขึ้นไป) แทน PULL_FROM_URL เพราะ
 * PULL_FROM_URL บังคับให้ verify ความเป็นเจ้าของ domain ของ URL ซึ่งเราไม่ได้
 * เป็นเจ้าของ domain ของ TOS
 *
 * ข้อควรรู้: แอปที่ยังไม่ผ่าน content-posting audit จะโพสต์ได้เฉพาะ SELF_ONLY
 * — ตั้งผ่าน env TIKTOK_PRIVACY_LEVEL จนกว่าจะผ่าน audit
 */
@Injectable()
export class TikTokPublisher implements SocialPublisher {
  readonly platform: SocialPlatform = 'TIKTOK';

  async publish(input: PublishInput): Promise<PublishResult> {
    const { account, media } = input;
    const video = media[0];

    if (!video || !video.isVideo) {
      throw new PublishError(
        'tiktok.invalid_media',
        'TikTok only accepts a single video',
        false,
      );
    }

    const { buffer, size } = await downloadMedia(video.url);
    const init = await this.initUpload(
      account.accessToken,
      this.composeTitle(input),
      size,
    );

    await this.uploadFile(init.uploadUrl, buffer, size);
    const postId = await this.waitForPublish(account.accessToken, init.publishId);

    return {
      remotePostId: postId ?? init.publishId,
      remoteUrl: postId
        ? `https://www.tiktok.com/@${account.displayName.replace(/^@/, '')}/video/${postId}`
        : null,
    };
  }

  /**
   * TikTok มี field เดียวสำหรับข้อความ — รวม caption กับ hashtag เข้าด้วยกัน
   *
   * @param input เนื้อหาของโพสต์
   * @returns title ที่จะแสดงใต้คลิป
   */
  private composeTitle(input: PublishInput): string {
    const parts = [input.caption.trim()];
    if (input.hashtags.length > 0) {
      parts.push(
        input.hashtags.map((tag) => `#${tag.replace(/^#/, '')}`).join(' '),
      );
    }
    return parts.filter(Boolean).join(' ');
  }

  /**
   * เปิด session อัปโหลดและขอ upload_url
   *
   * ส่งเป็นก้อนเดียว (chunk = ขนาดไฟล์ทั้งไฟล์) เพราะคลิปที่ระบบ generate ออกมา
   * สั้นและเล็กพอเสมอ ไม่ต้องแบ่ง chunk
   *
   * @param token access token
   * @param title ข้อความใต้คลิป
   * @param size ขนาดไฟล์เป็น byte
   * @returns publish id และ upload url
   * @throws PublishError เมื่อ TikTok ไม่คืน upload url
   */
  private async initUpload(
    token: string,
    title: string,
    size: number,
  ): Promise<{ publishId: string; uploadUrl: string }> {
    const result = await requestJson<InitResponse>(
      'tiktok.publish_init',
      `${TIKTOK_API}/post/publish/video/init/`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          post_info: {
            title,
            privacy_level:
              process.env.TIKTOK_PRIVACY_LEVEL || 'SELF_ONLY',
            disable_duet: false,
            disable_comment: false,
            disable_stitch: false,
          },
          source_info: {
            source: 'FILE_UPLOAD',
            video_size: size,
            chunk_size: size,
            total_chunk_count: 1,
          },
        }),
      },
    );

    const publishId = result.data?.publish_id;
    const uploadUrl = result.data?.upload_url;
    if (!publishId || !uploadUrl) {
      throw new PublishError(
        'tiktok.init_incomplete',
        `TikTok did not return an upload URL: ${result.error?.message ?? 'unknown'}`,
        false,
        result,
      );
    }
    return { publishId, uploadUrl };
  }

  /**
   * PUT ไฟล์ขึ้น upload_url ที่ TikTok ให้มา
   *
   * @param uploadUrl URL ที่ได้จาก init
   * @param buffer เนื้อไฟล์
   * @param size ขนาดไฟล์
   * @throws PublishError เมื่ออัปโหลดไม่สำเร็จ
   */
  private async uploadFile(
    uploadUrl: string,
    buffer: Buffer,
    size: number,
  ): Promise<void> {
    const response = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Length': String(size),
        'Content-Range': `bytes 0-${size - 1}/${size}`,
      },
      body: buffer,
    });
    if (!response.ok) {
      throw new PublishError(
        `tiktok.upload_http_${response.status}`,
        `TikTok upload failed (${response.status})`,
        response.status >= 500,
      );
    }
  }

  /**
   * รอจน TikTok ประมวลผลคลิปเสร็จ
   *
   * @param token access token
   * @param publishId id ที่ได้จาก init
   * @returns post id ที่เผยแพร่จริง (null เมื่อโพสต์แบบ SELF_ONLY ซึ่งไม่มี public id)
   * @throws PublishError เมื่อ TikTok ปฏิเสธคลิป หรือรอเกินเวลา
   */
  private async waitForPublish(
    token: string,
    publishId: string,
  ): Promise<string | null> {
    const deadline = Date.now() + STATUS_POLL_TIMEOUT_MS;

    while (Date.now() < deadline) {
      const result = await requestJson<StatusResponse>(
        'tiktok.publish_status',
        `${TIKTOK_API}/post/publish/status/fetch/`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ publish_id: publishId }),
        },
      );

      const status = result.data?.status;
      if (status === 'PUBLISH_COMPLETE') {
        return result.data?.publicaly_available_post_id?.[0] ?? null;
      }
      if (status === 'FAILED') {
        throw new PublishError(
          'tiktok.publish_failed',
          `TikTok rejected the video: ${result.data?.fail_reason ?? 'unknown reason'}`,
          false,
          result,
        );
      }
      await delay(STATUS_POLL_INTERVAL_MS);
    }

    throw new PublishError(
      'tiktok.publish_timeout',
      'TikTok did not finish processing the video in time',
      true,
    );
  }
}
