import { Injectable } from '@nestjs/common';
import {
  PublishError,
  PublishInput,
  PublishResult,
  SocialPlatform,
  SocialPublisher,
} from '@ai-media/share';
import { downloadMedia } from './provider-http.util';

const UPLOAD_ENDPOINT =
  'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status';

/** YouTube ตัด title ที่ 100 ตัวอักษร — ตัดเองก่อนเพื่อไม่ให้ API ปฏิเสธ */
const MAX_TITLE_LENGTH = 100;

/**
 * อัปโหลดวิดีโอขึ้น YouTube ผ่าน Data API v3 (resumable upload)
 *
 * ระวังเรื่อง quota: videos.insert กิน 1600 units ในขณะที่ default quota คือ
 * 10,000 units/วัน = อัปได้ราว 6 คลิป/วันเท่านั้น
 */
@Injectable()
export class YouTubePublisher implements SocialPublisher {
  readonly platform: SocialPlatform = 'YOUTUBE';

  async publish(input: PublishInput): Promise<PublishResult> {
    const { account, media } = input;
    const video = media[0];

    if (!video || !video.isVideo) {
      throw new PublishError(
        'youtube.invalid_media',
        'YouTube only accepts a single video',
        false,
      );
    }

    const { buffer, size } = await downloadMedia(video.url);
    const uploadUrl = await this.startResumableSession(
      account.accessToken,
      this.buildMetadata(input),
      size,
      video.mimeType,
    );
    const videoId = await this.uploadBytes(
      uploadUrl,
      buffer,
      size,
      video.mimeType,
    );

    return {
      remotePostId: videoId,
      remoteUrl: `https://www.youtube.com/watch?v=${videoId}`,
    };
  }

  /**
   * ประกอบ snippet/status ของคลิป
   *
   * title มาจากบรรทัดแรกของ caption (YouTube ไม่มี caption รวมแบบ social อื่น)
   * ส่วน caption เต็มและ link ไปอยู่ใน description
   *
   * @param input เนื้อหาของโพสต์
   * @returns metadata สำหรับ videos.insert
   */
  private buildMetadata(input: PublishInput): Record<string, unknown> {
    const caption = input.caption.trim();
    const firstLine = caption.split('\n')[0] || 'Untitled';
    const description = [caption, input.linkUrl]
      .filter(Boolean)
      .join('\n\n');

    return {
      snippet: {
        title: firstLine.slice(0, MAX_TITLE_LENGTH),
        description,
        // YouTube ต้องการ tag แบบไม่มี # นำหน้า
        tags: input.hashtags.map((tag) => tag.replace(/^#/, '')),
      },
      status: {
        privacyStatus: process.env.YOUTUBE_PRIVACY_STATUS || 'public',
        selfDeclaredMadeForKids: false,
      },
    };
  }

  /**
   * เปิด resumable session แล้วรับ upload URL
   *
   * @param token access token
   * @param metadata snippet/status ของคลิป
   * @param size ขนาดไฟล์
   * @param mimeType ชนิดไฟล์
   * @returns URL สำหรับอัปโหลดเนื้อไฟล์
   * @throws PublishError เมื่อ Google ไม่คืน Location header
   */
  private async startResumableSession(
    token: string,
    metadata: Record<string, unknown>,
    size: number,
    mimeType: string,
  ): Promise<string> {
    const response = await fetch(UPLOAD_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Length': String(size),
        'X-Upload-Content-Type': mimeType,
      },
      body: JSON.stringify(metadata),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new PublishError(
        `youtube.session_http_${response.status}`,
        `YouTube rejected the upload session (${response.status}): ${text.slice(0, 500)}`,
        response.status === 429 || response.status >= 500,
      );
    }

    const uploadUrl = response.headers.get('location');
    if (!uploadUrl) {
      throw new PublishError(
        'youtube.no_upload_url',
        'YouTube did not return a resumable upload URL',
        true,
      );
    }
    return uploadUrl;
  }

  /**
   * ส่งเนื้อไฟล์ขึ้น upload URL
   *
   * ส่งทีเดียวทั้งไฟล์ — คลิปที่ระบบ generate ออกมาเล็กพอ ไม่ต้องแบ่ง chunk
   *
   * @param uploadUrl URL จาก resumable session
   * @param buffer เนื้อไฟล์
   * @param size ขนาดไฟล์
   * @param mimeType ชนิดไฟล์
   * @returns video id
   * @throws PublishError เมื่ออัปโหลดไม่สำเร็จ
   */
  private async uploadBytes(
    uploadUrl: string,
    buffer: Buffer,
    size: number,
    mimeType: string,
  ): Promise<string> {
    const response = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': mimeType,
        'Content-Length': String(size),
      },
      body: buffer,
    });

    const text = await response.text();
    if (!response.ok) {
      throw new PublishError(
        `youtube.upload_http_${response.status}`,
        `YouTube upload failed (${response.status}): ${text.slice(0, 500)}`,
        response.status === 429 || response.status >= 500,
      );
    }

    const body = JSON.parse(text) as { id?: string };
    if (!body.id) {
      throw new PublishError(
        'youtube.no_video_id',
        'YouTube did not return a video id',
        false,
        body,
      );
    }
    return body.id;
  }
}
