import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job, UnrecoverableError } from 'bullmq';
import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { InjectRedis } from '@nestjs-modules/ioredis';
import Redis from 'ioredis';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';
import * as https from 'https';
import {
  RequestAudioGenerateDto,
  AudioFormat,
  GalleryRepository,
  LogRepository,
  QUEUE_NAME_AUDIO,
  MAX_CONCURRENT_TASKS_PER_TYPE,
  StorageUrlService,
  TosService,
  buildOutputKey,
  MasterdataModelTypeRepository,
  describeTosError,
  TraceJob,
  TRACE_CARRIER_KEY,
  injectTraceContext,
} from '@ai-media/share';
import { Span } from 'nestjs-otel';
import { Prisma } from '@prisma/client';
import { tosConfigs } from 'src/configs';
import { GenerateHelperService } from './generate-helper.service';
import { unwrapProviderMessage } from './video.service';

/** Seed Audio ตอบแบบ sync (≤120s เสียง) — กันไม่ให้ worker slot ค้างถ้า gateway ไม่ตอบ */
const AUDIO_API_TIMEOUT_MS = 5 * 60 * 1000;

const FILE_BY_FORMAT: Record<AudioFormat, { ext: string; contentType: string }> =
  {
    mp3: { ext: 'mp3', contentType: 'audio/mpeg' },
    wav: { ext: 'wav', contentType: 'audio/wav' },
    ogg_opus: { ext: 'ogg', contentType: 'audio/ogg' },
  };

/** prefix ทุก log ของงานเดียวกัน — `grep <taskId>` แล้วเห็นทั้ง flow */
const tag = (taskId: string) => `[audio][${taskId}]`;

interface AudioProcessJob {
  taskId: string;
  clientId: string;
  body: RequestAudioGenerateDto;
  userId: string;
  sendApi: string;
  sendConfig: {
    type: string;
    configType: string;
    authorization?: string;
    [k: string]: unknown;
  };
  authorization?: string | null;
  /** ตั้งหลังอัปโหลดเสร็จ — retry ข้ามการเรียก provider และอัปโหลดซ้ำ */
  output?: AudioOutput;
}

interface AudioOutput {
  objectName: string;
  duration: number | null;
  /** วินาทีที่ provider คิดเงิน — ใช้ตัดเครดิตจริง */
  originalDuration: number | null;
  subtitles: unknown[] | null;
}

export interface ParsedAudioResponse {
  audioBase64: string | null;
  url: string | null;
  duration: number | null;
  originalDuration: number | null;
  subtitles: unknown[] | null;
}

type PayloadBuilder = (
  body: RequestAudioGenerateDto,
) => Promise<Record<string, unknown>>;

/**
 * อ่านผล Seed Audio — รับทั้ง body ตรงและแบบที่ gateway ห่อไว้ใน `data`
 * @throws เมื่อ provider ตอบ code error หรือไม่มีทั้ง audio และ url
 */
export function parseAudioResponse(raw: unknown): ParsedAudioResponse {
  const root = (raw ?? {}) as Record<string, any>;
  const data: Record<string, any> =
    root.data && typeof root.data === 'object' ? root.data : root;
  const code = root.code ?? data.code;
  // Seed Speech ใช้ 0 หรือ 20000000 เป็น success
  if (typeof code === 'number' && code !== 0 && code !== 20000000) {
    throw new Error(
      unwrapProviderMessage(String(root.message ?? data.message ?? code)),
    );
  }
  const audioBase64 =
    typeof data.audio === 'string' && data.audio ? data.audio : null;
  const url = typeof data.url === 'string' && data.url ? data.url : null;
  if (!audioBase64 && !url) {
    throw new Error('Seed Audio response has neither audio nor url');
  }
  // docs: `subtitle.sentences` (มีเฉพาะเมื่อเปิด enable_subtitle)
  const subtitles = data.subtitle?.sentences ?? data.sentences;
  const duration = typeof data.duration === 'number' ? data.duration : null;
  return {
    audioBase64,
    url,
    duration,
    originalDuration:
      typeof data.original_duration === 'number'
        ? data.original_duration
        : duration,
    subtitles: Array.isArray(subtitles) ? subtitles : null,
  };
}

/** ตัด base64 ออกจาก log — เสียงยาวได้หลาย MB */
const redactAudio = (raw: unknown): unknown => {
  const redact = (obj: Record<string, any>) =>
    typeof obj?.audio === 'string'
      ? { ...obj, audio: `<base64 ${obj.audio.length} chars>` }
      : obj;
  const root = redact((raw ?? {}) as Record<string, any>);
  return root.data && typeof root.data === 'object'
    ? { ...root, data: redact(root.data) }
    : root;
};

@Injectable()
@Processor(QUEUE_NAME_AUDIO, { concurrency: MAX_CONCURRENT_TASKS_PER_TYPE })
export class AudioProcessor extends WorkerHost implements OnModuleDestroy {
  private readonly logger = new Logger(AudioProcessor.name);
  private agent: https.Agent;
  private redisPublisher: Redis;

  /** คีย์ = `sendConfig.type` ใน master_model_type */
  private readonly payloadBuilders: Record<string, PayloadBuilder> = {
    seedaudio1: (body) => this.buildSeedAudio1Payload(body),
  };

  constructor(
    @InjectRedis() private readonly redis: Redis,
    private readonly galleryRepo: GalleryRepository,
    private readonly logrepo: LogRepository,
    private readonly tosService: TosService,
    private readonly storageUrl: StorageUrlService,
    private readonly generateHelperService: GenerateHelperService,
    private readonly masterModelTypeRepo: MasterdataModelTypeRepository,
  ) {
    super();
    this.agent = new https.Agent({
      rejectUnauthorized: false,
    });

    // สร้าง Redis Publisher สำหรับส่ง events ไปยัง Core Service
    this.redisPublisher = new Redis({
      host: process.env.REDIS_HOST,
      port: Number(process.env.REDIS_PORT),
      ...(process.env.REDIS_PASSWORD && {
        password: process.env.REDIS_PASSWORD,
      }),
    });
  }

  async onModuleDestroy() {
    await this.redisPublisher.quit();
  }

  @OnWorkerEvent('active')
  onActive(job: Job) {
    this.logger.log(`🟢 Job ${job.id} is now active`);
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job) {
    this.logger.log(`✅ Job ${job.id} completed`);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, error: Error) {
    this.logger.error(`❌ Job ${job.id} failed: ${error.message}`);
  }

  @TraceJob()
  // ใช้ Job ของ WorkerHost — worker-service มี bullmq คนละสำเนากับ root
  async process(job: Parameters<WorkerHost['process']>[0]): Promise<unknown> {
    const { taskId, clientId, body, userId, sendApi, sendConfig } =
      job.data as AudioProcessJob;
    // Per-org LLM gateway key set by the producer (falls back to the model token).
    const authorization: string =
      (job.data as AudioProcessJob).authorization ??
      sendConfig?.authorization ??
      '';
    const redisCreditCacheKey = `${body.organizationId}/${body.projectId}/credit_used_${userId}`;

    this.logger.log(
      `${tag(taskId)} 👨‍🍳 submit job=${
        job.id
      } client=${clientId} user=${userId} model=${body?.model} attempt=${
        job.attemptsMade + 1
      }`,
    );
    this.logger.log(`${tag(taskId)} body=${JSON.stringify(body)}`);

    try {
      const model = await this.masterModelTypeRepo.findOne({
        where: { modelType: body.model, type: 'audio', isActive: true },
      });
      // body ยังไม่มี duration → สูตรคืนยอดที่ core hold ไว้ (เพดาน 120s)
      const held = await this.generateHelperService.getUsedCredit(
        0,
        body,
        model,
      );
      if (!held) {
        throw new UnrecoverableError(
          `audio pricing is not configured for model ${body.model}`,
        );
      }

      await this.publishToCore(clientId, 'worker:audio-started', {
        taskId,
        timestamp: new Date().toISOString(),
        type: 'audio',
        projectId: body.projectId,
      });
      await this.updateTaskStatus(taskId, {
        status: 'processing',
        startedAt: new Date().toISOString(),
      });

      let output = (job.data as AudioProcessJob).output;
      if (output) {
        this.logger.log(
          `${tag(taskId)} resume stored output ${
            output.objectName
          } (retry/stalled) — no resubmit`,
        );
      } else {
        output = await this.generateAndStore(
          taskId,
          body,
          userId,
          sendApi,
          sendConfig,
          authorization,
        );
        // retry หลังจากนี้ (เช่น DB ล่ม) ไม่ต้องเรียก provider ซ้ำ
        await job.updateData({ ...(job.data as AudioProcessJob), output });
      }

      // ตัดตามวินาทีที่ provider คิดเงินจริง แล้วคืนส่วนต่างจากยอด hold
      const credit =
        (output.originalDuration !== null &&
          output.originalDuration !== undefined &&
          (await this.generateHelperService.getUsedCredit(
            0,
            { ...body, duration: output.originalDuration },
            model,
          ))) ||
        held;
      this.logger.log(
        `${tag(taskId)} 💰 credit held=${held.credit} actual=${
          credit.credit
        } (originalDuration=${output.originalDuration ?? 'n/a'}s)`,
      );

      const generateConfig = {
        ...((await this.readPendingConfig(taskId)) ?? {}),
        ...(output.duration !== null && { duration: output.duration }),
        ...(output.subtitles && { subtitles: output.subtitles }),
      } as Prisma.InputJsonValue;

      await this.saveGallery({
        taskId,
        projectId: body.projectId,
        userId,
        prompt: body.prompt,
        imageUrl: output.objectName,
        resultUrl: [output.objectName],
        typeGenerate: 'audio',
        genneratedStatus: 'SUCCESS',
        status: false,
        usedCredit: credit.credit,
        tokenUsed: credit.token,
        usedImage: 0,
        ImageUsed: 0,
        referenceImages: (body.image ?? []).filter(Boolean),
        generateConfig,
      });
      await this.logrepo.updateMany({
        where: { taskId },
        data: {
          status: 'success',
          usedCredit: credit.credit,
          tokenUsed: credit.token,
          generateConfig,
        },
      });

      const updated = await this.generateHelperService.updateUsedCreditSuccess(
        userId,
        body.organizationId,
        body.projectId,
        'credit',
        credit.credit,
        held.credit,
      );
      if (updated) {
        await this.redis.set(
          redisCreditCacheKey,
          (
            updated.usedCreditAllowance + updated.holdCreditAllowance
          ).toString(),
          'EX',
          60 * 60,
        );
      }

      await this.updateTaskStatus(taskId, {
        status: 'completed',
        completedAt: new Date().toISOString(),
        audio: output.objectName,
      });

      const audioUrl = await this.storageUrl.toDisplayUrl(
        buildOutputKey(
          body.organizationId,
          body.projectId,
          'audio',
          output.objectName,
        ),
        null,
      );
      await this.publishToCore(clientId, 'worker:audio-complete', {
        taskId,
        success: true,
        timestamp: new Date().toISOString(),
        projectId: body.projectId,
        type: 'audio',
        data: {
          projectId: body.projectId,
          userId,
          prompt: body.prompt,
          audioUrl,
          resultUrl: [output.objectName],
          typeGenerate: 'audio',
          genneratedStatus: 'SUCCESS',
          status: true,
          usedCredit: credit.credit,
          generateConfig,
        },
      });

      this.logger.log(`${tag(taskId)} 🎉 completed → ${output.objectName}`);
      return { success: true, taskId, objectName: output.objectName };
    } catch (error) {
      // คืนเครดิต/ปิด FAILED เฉพาะครั้งสุดท้าย — ไม่งั้น retry ที่สำเร็จจะตัดเครดิตที่คืนไปแล้ว
      const isFinalAttempt =
        error instanceof UnrecoverableError ||
        job.attemptsMade + 1 >= (job.opts?.attempts ?? 1);
      if (isFinalAttempt) {
        await this.failTask(job.data as AudioProcessJob, error as Error);
      } else {
        this.logger.warn(
          `${tag(taskId)} attempt ${job.attemptsMade + 1} failed, will retry: ${
            (error as Error).message
          }`,
        );
      }
      throw error;
    }
  }

  /** เรียก provider แล้วเก็บไฟล์ลง TOS — คืนชื่อ object ที่เก็บแล้ว */
  @Span()
  private async generateAndStore(
    taskId: string,
    body: RequestAudioGenerateDto,
    userId: string,
    sendApi: string,
    sendConfig: AudioProcessJob['sendConfig'],
    authorization: string,
  ): Promise<AudioOutput> {
    const payload = await this.buildPayload(body, sendConfig);
    // header มี Authorization — log แค่ payload
    this.logger.log(
      `${tag(taskId)} → POST ${sendApi} payload=${JSON.stringify(payload)}`,
    );

    let responseData: unknown;
    try {
      const apiRes = await axios.post(sendApi, payload, {
        headers: {
          'Content-Type': sendConfig.configType,
          Authorization: `Bearer ${authorization}`,
        },
        httpsAgent: this.agent,
        timeout: AUDIO_API_TIMEOUT_MS,
      });
      responseData = apiRes.data;
    } catch (error: any) {
      const apiStatus = error.response?.status;
      const apiBody = error.response?.data;
      const apiMessage = unwrapProviderMessage(
        String(apiBody?.error?.message ?? apiBody?.message ?? error.message),
      );
      this.logger.error(
        `${tag(
          taskId,
        )} ❌ Audio API call failed: API ${apiStatus}: ${apiMessage} | response=${JSON.stringify(
          redactAudio(apiBody),
        )}`,
      );
      throw new UnrecoverableError(apiMessage);
    }
    this.logger.log(
      `${tag(taskId)} ← provider response=${JSON.stringify(
        redactAudio(responseData),
      )}`,
    );
    await this.generateHelperService.logAudit(userId, 'CREATE', body, taskId);

    let parsed: ParsedAudioResponse;
    try {
      parsed = parseAudioResponse(responseData);
    } catch (error) {
      throw new UnrecoverableError((error as Error).message);
    }

    const { ext, contentType } = FILE_BY_FORMAT[body.format];
    const objectName = `${uuidv4()}.${ext}`;
    const bucket = tosConfigs().tosBucket;
    const key = buildOutputKey(
      body.organizationId,
      body.projectId,
      'audio',
      objectName,
    );
    const startedAt = Date.now();
    try {
      if (parsed.audioBase64) {
        await this.tosService.putObject(
          bucket,
          key,
          Buffer.from(parsed.audioBase64, 'base64'),
          { contentType },
        );
      } else {
        await this.tosService.fetchObject(bucket, key, parsed.url as string);
      }
    } catch (error) {
      this.logger.error(
        `${tag(taskId)} ❌ store audio failed after ${
          Date.now() - startedAt
        }ms — ${describeTosError(error)}`,
      );
      throw error;
    }
    this.logger.log(
      `${tag(taskId)} 🚀 stored audio (${
        parsed.audioBase64 ? 'base64 putObject' : 'fetchObject'
      }, ${Date.now() - startedAt}ms) → ${key}`,
    );
    return {
      objectName,
      duration: parsed.duration,
      originalDuration: parsed.originalDuration,
      subtitles: parsed.subtitles,
    };
  }

  private async buildPayload(
    body: RequestAudioGenerateDto,
    sendConfig: AudioProcessJob['sendConfig'],
  ) {
    const builder = this.payloadBuilders[sendConfig?.type];
    if (!builder) {
      throw new UnrecoverableError(
        `Unsupported audio sendConfig.type: "${sendConfig?.type}"`,
      );
    }
    return builder(body);
  }

  /** ฟิลด์ตาม Seed Audio 1.0 `/api/v3/tts/create` — ส่งค่า optional เฉพาะที่ผู้ใช้ตั้ง */
  private async buildSeedAudio1Payload(body: RequestAudioGenerateDto) {
    const references = [
      ...(await Promise.all(
        (body.references ?? []).map(async (ref) =>
          ref.speaker
            ? { speaker: ref.speaker }
            : { audio_url: await this.storageUrl.toProviderUrl(ref.url) },
        ),
      )),
      ...(await Promise.all(
        (body.image ?? [])
          .filter(Boolean)
          .map(async (image) => ({
            image_url: await this.storageUrl.toProviderUrl(image),
          })),
      )),
    ];
    return {
      model: body.model,
      text_prompt: body.prompt,
      ...(references.length && { references }),
      audio_config: {
        format: body.format,
        ...(body.sampleRate && { sample_rate: body.sampleRate }),
        ...(body.speechRate && { speech_rate: body.speechRate }),
        ...(body.loudnessRate && { loudness_rate: body.loudnessRate }),
        ...(body.pitchRate && { pitch_rate: body.pitchRate }),
        ...(body.enableSubtitle && { enable_subtitle: true }),
      },
    };
  }

  /** generateConfig ที่ core เขียนไว้ตอน submit — เติมผลลัพธ์ต่อโดยไม่ทับของเดิม */
  private async readPendingConfig(
    taskId: string,
  ): Promise<Record<string, unknown> | null> {
    const row = await this.galleryRepo.findOne({ where: { taskId } });
    const config = row?.generateConfig;
    return config && typeof config === 'object' && !Array.isArray(config)
      ? (config as Record<string, unknown>)
      : null;
  }

  /** ปิดงานที่ล้ม: คืนเครดิตที่ hold ไว้ · gallery/log = FAILED · แจ้ง frontend */
  @Span()
  private async failTask(data: AudioProcessJob, error: Error): Promise<void> {
    const { taskId, clientId, body, userId } = data;
    this.logger.error(`${tag(taskId)} ❌ failed: ${error.message}`, error.stack);
    try {
      await this.generateHelperService.logError(
        userId,
        error.message,
        error.stack,
        body,
      );
      await this.updateTaskStatus(taskId, {
        status: 'failed',
        failedAt: new Date().toISOString(),
        error: error.message,
      });
      const creditForFailure = await this.generateHelperService.getUsedCredit(
        0,
        body,
        await this.masterModelTypeRepo.findOne({
          where: { modelType: body.model, type: 'audio', isActive: true },
        }),
      );
      await this.generateHelperService.updateUsedCreditFail(
        userId,
        body.organizationId,
        body.projectId,
        'credit',
        creditForFailure?.credit ?? 0,
      );
      await this.galleryRepo.updateMany({
        where: { taskId },
        data: { genneratedStatus: 'FAILED', status: false },
      });
      await this.logrepo.updateMany({
        where: { taskId },
        data: { status: 'failed' },
      });
    } catch (cleanupError) {
      // ห้ามกลืน error เดิม — log ไว้ให้ตามคืนเครดิตเองได้
      this.logger.error(
        `${tag(taskId)} ❌ fail cleanup error: ${
          (cleanupError as Error).message
        }`,
      );
    }
    await this.publishToCore(clientId, 'worker:audio-error', {
      taskId,
      error: error.message,
      message: error.message,
      timestamp: new Date().toISOString(),
      projectId: body.projectId,
      type: 'audio',
    });
  }

  /**
   * ส่ง event ไปยัง Core Service ผ่าน Redis Pub/Sub
   */
  @Span()
  private async publishToCore(
    clientId: string,
    event: string,
    payload: unknown,
  ) {
    const parts = event.split(':');
    const channel = `worker:${parts[parts.length - 1] || 'event'}`;
    try {
      await this.redisPublisher.publish(
        channel,
        JSON.stringify({
          clientId,
          event,
          payload,
          timestamp: new Date().toISOString(),
          // core ต่อ trace จากตรงนี้ (WebsocketGateway.onWorkerMessage)
          [TRACE_CARRIER_KEY]: injectTraceContext(),
        }),
      );
    } catch (error) {
      this.logger.error(
        `Failed to publish event: ${(error as Error).message}`,
      );
    }
  }

  /**
   * เขียนผลลง gallery row PENDING ที่ core สร้างตอน submit (update ซ้ำได้ ไม่เกิด row ซ้ำตอน retry)
   */
  @Span()
  private async saveGallery(data: Prisma.GalleryUncheckedCreateInput) {
    const { count } = await this.galleryRepo.updateMany({
      where: { taskId: data.taskId },
      data,
    });
    if (count > 0) return;
    this.logger.warn(
      `⚠️ No PENDING gallery row for task ${data.taskId} — creating one`,
    );
    await this.galleryRepo.create({ data });
  }

  @Span()
  private async updateTaskStatus(taskId: string, updates: object) {
    const taskData = await this.redis.get(`task:${taskId}`);
    if (taskData) {
      await this.redis.set(
        `task:${taskId}`,
        JSON.stringify({ ...JSON.parse(taskData), ...updates }),
        'EX',
        60 * 60,
      );
    }
  }
}
