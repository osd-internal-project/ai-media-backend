import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { TosService, buildOutputKey, describeTosError } from '@ai-media/share';
import { v4 as uuidv4 } from 'uuid';
import { tosConfigs } from 'src/configs';

/** ตำแหน่ง snapshot เมื่อไม่รู้ความยาววิดีโอ */
const DEFAULT_SNAPSHOT_MS = 1000;

/** รอ TOS fetch ไม่เกินนี้ — omnihuman เคย TLS handshake timeout กับ CDN ของ ByteDance/TikTok */
const TOS_FETCH_TIMEOUT_MS = 30_000;

export interface StoreVideoInput {
  organizationId: string;
  projectId: string;
  /** segment ใน output key เช่น `video` | `dreamactor` | `omnihumen` */
  typeGenerate: string;
  /** URL วิดีโอผลลัพธ์จาก provider */
  sourceUrl: string;
  /** ความยาววิดีโอ (วินาที) ถ้ารู้ — ใช้วาง snapshot ที่ 20% ของคลิป */
  durationSec?: number;
}

export interface StoredVideo {
  file: string;
  thumbnail: string;
}

/**
 * เก็บวิดีโอผลลัพธ์ + thumbnail ลง TOS: TOS ดึงวิดีโอจาก provider เอง (`fetchObject`)
 * และทำ thumbnail ฝั่ง TOS (`video/snapshot`) — bytes ไม่ผ่าน pod; ขั้นไหนล้ม = throw ให้งาน fail
 */
@Injectable()
export class VideoStorageService {
  private readonly logger = new Logger(VideoStorageService.name);

  constructor(private readonly tosService: TosService) {}

  /**
   * @returns objectName ของวิดีโอและ thumbnail (ไม่รวม prefix) สำหรับเก็บลง DB
   * @throws BadRequestException เมื่อ fetch หรือ snapshot ล้ม
   */
  async storeVideoWithThumbnail(input: StoreVideoInput): Promise<StoredVideo> {
    const now = Date.now();
    const file = `${now}-${uuidv4()}.mp4`;
    const thumbnail = `thumb-${now}.png`;
    const bucket = tosConfigs().tosBucket;
    const videoKey = this.key(input, file);
    const thumbKey = this.key(input, thumbnail);

    try {
      await this.fetchVideo(bucket, videoKey, input);
    } catch (error) {
      throw this.failure(error);
    }
    try {
      await this.snapshot(bucket, videoKey, thumbKey, input);
    } catch (error) {
      // วิดีโอไม่มี thumbnail ใช้ใน gallery ไม่ได้ — ลบทิ้งแล้วให้งาน fail (deleteObject log error เอง)
      await this.tosService.deleteObject(bucket, videoKey);
      throw this.failure(error);
    }
    return { file, thumbnail };
  }

  private key(input: StoreVideoInput, objectName: string): string {
    return buildOutputKey(
      input.organizationId,
      input.projectId,
      input.typeGenerate,
      objectName,
    );
  }

  private failure(error: unknown): BadRequestException {
    return new BadRequestException(
      'Error processing video: ' + describeTosError(error),
    );
  }

  private async fetchVideo(
    bucket: string,
    key: string,
    input: StoreVideoInput,
  ): Promise<void> {
    const startedAt = Date.now();
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`timed out after ${TOS_FETCH_TIMEOUT_MS}ms`)),
        TOS_FETCH_TIMEOUT_MS,
      );
    });
    try {
      await Promise.race([
        this.tosService.fetchObject(bucket, key, input.sourceUrl),
        timeout,
      ]);
      this.logger.log(
        `🚀 [fetchObject] ${input.typeGenerate} stored by TOS directly (${
          Date.now() - startedAt
        }ms) → ${key}`,
      );
    } catch (error) {
      this.logger.error(
        `❌ [fetchObject] ${input.typeGenerate} failed after ${
          Date.now() - startedAt
        }ms — ${describeTosError(error)}`,
      );
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  private async snapshot(
    bucket: string,
    videoKey: string,
    thumbKey: string,
    input: StoreVideoInput,
  ): Promise<void> {
    const atMs =
      input.durationSec && input.durationSec > 0
        ? input.durationSec * 0.2 * 1000
        : DEFAULT_SNAPSHOT_MS;
    const startedAt = Date.now();
    try {
      await this.tosService.createVideoThumbnail(
        bucket,
        videoKey,
        thumbKey,
        atMs,
        'png',
      );
      this.logger.log(
        `🖼️ [snapshot] ${input.typeGenerate} thumbnail by TOS (${
          Date.now() - startedAt
        }ms) → ${thumbKey}`,
      );
    } catch (error) {
      this.logger.error(
        `❌ [snapshot] ${input.typeGenerate} failed after ${
          Date.now() - startedAt
        }ms — ${describeTosError(error)}`,
      );
      throw error;
    }
  }
}
