import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import {
  IMMUTABLE_CACHE_CONTROL,
  TosService,
  buildOutputKey,
  describeTosError,
} from '@ai-media/share';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import * as https from 'https';
import * as os from 'os';
import * as path from 'path';
import { promises as fsp } from 'fs';
import ffmpeg = require('fluent-ffmpeg');
import { tosConfigs } from 'src/configs';
// CJS binaries path packages (ffprobe-static has no typings) — same setup as the processors
// eslint-disable-next-line @typescript-eslint/no-var-requires
const ffmpegPath = require('ffmpeg-static');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const ffprobePath = require('ffprobe-static');

ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobePath.path);

/** ตำแหน่ง snapshot เมื่อไม่รู้ความยาววิดีโอ */
const DEFAULT_SNAPSHOT_MS = 1000;

/**
 * รอ TOS fetch ไม่เกินนี้ — omnihuman เคย TLS handshake timeout กับ CDN ของ ByteDance/TikTok
 * เกินแล้วไปทาง download+upload (ถ้า TOS เขียนเสร็จทีหลัง key เดิมจะถูก fallback ทับ)
 */
const TOS_FETCH_TIMEOUT_MS = 30_000;

export interface StoreVideoInput {
  organizationId: string;
  projectId: string;
  /** segment ใน output key เช่น `video` | `dreamactor` | `omnihumen` */
  typeGenerate: string;
  /** URL วิดีโอผลลัพธ์จาก provider */
  sourceUrl: string;
  /** ความยาววิดีโอ (วินาที) ถ้ารู้ — ใช้วาง snapshot ที่ 20% เหมือน ffmpeg เดิม */
  durationSec?: number;
}

export interface StoredVideo {
  file: string;
  thumbnail: string;
}

/**
 * เก็บวิดีโอผลลัพธ์ + thumbnail ลง TOS
 *
 * ทางหลักให้ TOS ดึงวิดีโอจาก provider เอง (`fetchObject`) และทำ thumbnail ฝั่ง TOS
 * (`video/snapshot`) — bytes ไม่ผ่าน pod; ถ้าขั้นไหนล้มจะ fallback ไปดาวน์โหลด + ffmpeg แบบเดิม
 * ทุกขั้น log บอกทางที่ใช้: `[fetchObject]` `[snapshot]` `[download+upload]` `[ffmpeg]`
 */
@Injectable()
export class VideoStorageService {
  private readonly logger = new Logger(VideoStorageService.name);
  // provider บางรายใช้ cert ที่ verify ไม่ผ่าน — คงพฤติกรรมเดิมของ processor
  private readonly agent = new https.Agent({ rejectUnauthorized: false });

  constructor(private readonly tosService: TosService) {}

  /**
   * @returns objectName ของวิดีโอและ thumbnail (ไม่รวม prefix) สำหรับเก็บลง DB
   * @throws BadRequestException เมื่อทั้งทางหลักและ fallback ล้ม
   */
  async storeVideoWithThumbnail(input: StoreVideoInput): Promise<StoredVideo> {
    const now = Date.now();
    const file = `${now}-${uuidv4()}.mp4`;
    const thumbnail = `thumb-${now}.png`;
    const bucket = tosConfigs().tosBucket;
    const videoKey = this.key(input, file);
    const thumbKey = this.key(input, thumbnail);

    const type = input.typeGenerate;
    const videoStored = await this.tryFetch(
      bucket,
      videoKey,
      input.sourceUrl,
      type,
    );
    if (
      videoStored &&
      (await this.trySnapshot(bucket, videoKey, thumbKey, input))
    ) {
      return { file, thumbnail };
    }

    try {
      await this.storeViaDownload(
        bucket,
        videoKey,
        thumbKey,
        input.sourceUrl,
        !videoStored,
        type,
      );
      return { file, thumbnail };
    } catch (error) {
      this.logger.error(
        `Fallback upload failed for ${videoKey}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      throw new BadRequestException(
        'Error processing video: ' +
          (error instanceof Error ? error.message : String(error)),
      );
    }
  }

  private key(input: StoreVideoInput, objectName: string): string {
    return buildOutputKey(
      input.organizationId,
      input.projectId,
      input.typeGenerate,
      objectName,
    );
  }

  private async tryFetch(
    bucket: string,
    key: string,
    url: string,
    type: string,
  ): Promise<boolean> {
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
        this.tosService.fetchObject(bucket, key, url),
        timeout,
      ]);
      this.logger.log(
        `🚀 [fetchObject] ${type} stored by TOS directly (${
          Date.now() - startedAt
        }ms) → ${key}`,
      );
      return true;
    } catch (error) {
      this.logger.warn(
        `⚠️ [fetchObject] ${type} failed after ${
          Date.now() - startedAt
        }ms — ${describeTosError(error)}; falling back to download+upload`,
      );
      return false;
    } finally {
      clearTimeout(timer);
    }
  }

  private async trySnapshot(
    bucket: string,
    videoKey: string,
    thumbKey: string,
    input: StoreVideoInput,
  ): Promise<boolean> {
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
      return true;
    } catch (error) {
      this.logger.warn(
        `⚠️ [snapshot] ${input.typeGenerate} failed after ${
          Date.now() - startedAt
        }ms — ${describeTosError(error)}; falling back to ffmpeg`,
      );
      return false;
    }
  }

  /** flow เดิม: ดาวน์โหลดทั้งก้อน → ffmpeg ทำ thumbnail → put */
  private async storeViaDownload(
    bucket: string,
    videoKey: string,
    thumbKey: string,
    sourceUrl: string,
    uploadVideo: boolean,
    type: string,
  ): Promise<void> {
    const startedAt = Date.now();
    const res = await axios.get<ArrayBuffer>(sourceUrl, {
      responseType: 'arraybuffer',
      httpsAgent: this.agent,
    });
    const buffer = Buffer.from(res.data);
    const tempVideoPath = path.join(os.tmpdir(), path.basename(videoKey));
    const tempThumbPath = path.join(os.tmpdir(), path.basename(thumbKey));
    await fsp.writeFile(tempVideoPath, buffer);
    try {
      await new Promise((resolve, reject) => {
        ffmpeg(tempVideoPath)
          .screenshots({
            count: 1,
            folder: path.dirname(tempThumbPath),
            filename: path.basename(tempThumbPath),
            timemarks: ['20%'],
            size: '320x?',
          })
          .on('end', resolve)
          .on('error', reject);
      });
      if (uploadVideo) {
        await this.tosService.putObject(bucket, videoKey, buffer, {
          contentType: 'video/mp4',
          cacheControl: IMMUTABLE_CACHE_CONTROL,
        });
        this.logger.log(
          `📦 [download+upload] ${type} stored via pod (${
            buffer.length
          } bytes, ${Date.now() - startedAt}ms) → ${videoKey}`,
        );
      }
      await this.tosService.putObject(
        bucket,
        thumbKey,
        await fsp.readFile(tempThumbPath),
        {
          contentType: 'image/png',
          cacheControl: IMMUTABLE_CACHE_CONTROL,
        },
      );
      this.logger.log(
        `🎞️ [ffmpeg] ${type} thumbnail via pod (${
          Date.now() - startedAt
        }ms) → ${thumbKey}`,
      );
    } finally {
      await Promise.all(
        [tempVideoPath, tempThumbPath].map((p) =>
          fsp
            .rm(p, { force: true })
            .catch((error: unknown) =>
              this.logger.warn(
                `Cannot remove temp file ${p}: ${describeTosError(error)}`,
              ),
            ),
        ),
      );
    }
  }
}
