import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import {
  LlmChatError,
  LlmChatService,
  LlmGatewayService,
  LlmKeyStatus,
  OrganizationMemberRepository,
} from '@ai-media/share';
import { ChatModelService } from '../chat/services/chat-model.service';
import { LlmStatusQueryDto } from './dto/llm-status.dto';

/** ผลการยิงจริงไปยังปลายทางของโมเดล */
interface ProbeResult {
  readonly ok: boolean;
  readonly latencyMs: number | null;
  readonly status: number | null;
  readonly error: string | null;
}

/** สถานะรวมของ LLM สำหรับ org หนึ่ง */
export interface LlmStatusResult {
  readonly organizationId: string;
  readonly key: Omit<LlmKeyStatus, 'organizationId'>;
  readonly model: {
    readonly modelId: string;
    readonly supportsVision: boolean;
    readonly endpoint: string;
    /** บอกว่า endpoint ข้างบนมาจากไหน ใช้ยืนยันว่าค่าใน DB ถูกใช้จริง */
    readonly endpointSource: 'chat_model_config.send_api' | 'env';
    /** โมเดลนี้มี token สำรองใน send_config หรือไม่ (ไม่คืนตัว token) */
    readonly hasFallbackToken: boolean;
  } | null;
  readonly probe: ProbeResult | null;
  readonly status: 'ok' | 'degraded' | 'unavailable';
}

/** ข้อความที่ใช้ probe — สั้นที่สุดเท่าที่ยังพิสูจน์ได้ว่าเส้นทางทั้งเส้นใช้งานได้ */
const PROBE_MAX_TOKENS = 1;

@Injectable()
export class LlmStatusService {
  private readonly logger = new Logger(LlmStatusService.name);

  constructor(
    private readonly llmGateway: LlmGatewayService,
    private readonly llmChat: LlmChatService,
    private readonly chatModelService: ChatModelService,
    private readonly orgMemberRepo: OrganizationMemberRepository,
  ) {}

  /**
   * ตรวจว่า org นี้มี key ของตัวเองใช้งานได้หรือไม่ และคำขอจะไปที่ปลายทางใด
   *
   * ไม่เรียก getOrCreateApiKey เด็ดขาด — การถามสถานะต้องไม่เปลี่ยนสถานะ
   *
   * @param query org, ผู้เรียก, โมเดลที่จะตรวจ และจะยิงจริงหรือไม่
   * @returns สถานะของ key ปลายทางของโมเดล และผล probe (ถ้าขอ)
   * @throws ForbiddenException เมื่อผู้เรียกไม่ใช่สมาชิกของ org
   */
  async getStatus(query: LlmStatusQueryDto): Promise<LlmStatusResult> {
    await this.assertOrgMember(query.organizationId, query.userId);

    const { organizationId, ...key } = await this.llmGateway.getKeyStatus(
      query.organizationId,
    );

    const model = await this.resolveModel(query.model);
    const hasFallbackToken = Boolean(model?.sendConfig?.authorization);
    // มี credential อย่างใดอย่างหนึ่งก็ยิงได้ — ลำดับเดียวกับตอนแชทจริง
    const hasCredential = key.hasKey || hasFallbackToken;
    const probe =
      query.probe && model && hasCredential
        ? await this.probe(query.organizationId, model)
        : null;

    return {
      organizationId,
      key,
      model: model
        ? {
            modelId: model.modelId,
            supportsVision: model.supportsVision,
            endpoint: this.llmChat.resolveUrl({
              sendApi: model.sendApi ?? undefined,
            }),
            endpointSource: model.sendApi ? 'chat_model_config.send_api' : 'env',
            hasFallbackToken,
          }
        : null,
      probe,
      status: this.summarize(key, hasCredential, model !== null, probe),
    };
  }

  // ==========================================================================
  // Internals
  // ==========================================================================

  /**
   * หาโมเดลที่จะตรวจ
   *
   * โมเดลที่ตั้งค่าไว้ผิด (หรือยังไม่ได้ตั้งเลย) คือสิ่งที่ endpoint นี้มีไว้บอก —
   * จึงกลืน error แล้วคืน null แทนที่จะโยนต่อ
   *
   * @param modelId โมเดลที่ระบุมา (ไม่ระบุ = ตัว default)
   * @returns โมเดลที่ resolve ได้ หรือ null เมื่อหาไม่ได้
   */
  private async resolveModel(modelId?: string) {
    try {
      return await this.chatModelService.resolve(modelId);
    } catch (error) {
      this.logger.warn(
        `Cannot resolve chat model for status check: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return null;
    }
  }

  /**
   * ยิงคำขอจริงหนึ่งครั้งด้วย key ของ org ไปยังปลายทางของโมเดล
   *
   * ไม่โยน error ออกไปเลย — endpoint ที่ตอบ 500 ตอน gateway ล่ม แยกไม่ออกจาก
   * ตัวมันเองพัง ซึ่งทำให้ของที่มีไว้วินิจฉัยกลายเป็นสิ่งที่ต้องวินิจฉัยเสียเอง
   *
   * @param organizationId org ที่เป็นเจ้าของ key
   * @param model โมเดลที่ resolve แล้ว
   * @returns ผลการยิงพร้อมเวลาที่ใช้
   */
  private async probe(
    organizationId: string,
    model: Awaited<ReturnType<ChatModelService['resolve']>>,
  ): Promise<ProbeResult> {
    // อ่านอย่างเดียว ไม่ใช่ getOrCreateApiKey — การตรวจสถานะต้องไม่ mint key ใหม่
    const key = await this.llmGateway.getExistingApiKey(organizationId);
    if (!key && !model.sendConfig?.authorization) {
      return {
        ok: false,
        latencyMs: null,
        status: null,
        error: 'No API key stored for this organization',
      };
    }

    const startedAt = Date.now();
    try {
      await this.llmChat.complete({
        apiKey: key ?? '',
        model: model.modelId,
        messages: [{ role: 'user', content: 'ping' }],
        maxTokens: PROBE_MAX_TOKENS,
        sendApi: model.sendApi ?? undefined,
        sendConfig: model.sendConfig ?? undefined,
      });
      return {
        ok: true,
        latencyMs: Date.now() - startedAt,
        status: null,
        error: null,
      };
    } catch (error) {
      const latencyMs = Date.now() - startedAt;
      if (error instanceof LlmChatError) {
        return {
          ok: false,
          latencyMs,
          status: error.status,
          error: error.message,
        };
      }
      return {
        ok: false,
        latencyMs,
        status: null,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * สรุปสถานะรวมจากชิ้นส่วนที่ตรวจได้
   *
   * @param key สถานะ key ของ org
   * @param hasCredential มี key ของ org หรือ token สำรองของโมเดลอย่างน้อยหนึ่งอย่าง
   * @param hasModel resolve โมเดลได้หรือไม่
   * @param probe ผล probe (null = ไม่ได้ยิง)
   * @returns สถานะรวม
   */
  private summarize(
    key: Omit<LlmKeyStatus, 'organizationId'>,
    hasCredential: boolean,
    hasModel: boolean,
    probe: ProbeResult | null,
  ): LlmStatusResult['status'] {
    if (!hasCredential || !hasModel) return 'unavailable';
    if (probe && !probe.ok) return 'unavailable';
    // ยิงได้ แต่ยังไม่ใช่สภาพที่ตั้งใจ: key ของ host เก่า (คำขอถัดไปจะ re-mint ให้)
    // หรือกำลังใช้ token สำรองของโมเดล ซึ่งทำให้ค่าใช้จ่ายไม่ผูกกับ org ใดเลย
    if (!key.hasKey || !key.hostMatches) return 'degraded';
    return 'ok';
  }

  /**
   * ตรวจว่าเป็นสมาชิกขององค์กรที่อ้างถึง
   *
   * สถานะ key เป็นข้อมูลของ org — คนนอกไม่ควรรู้แม้แต่ว่ามี key อยู่หรือไม่
   *
   * @param organizationId องค์กรที่อ้างถึง
   * @param userId ผู้เรียก
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
}
