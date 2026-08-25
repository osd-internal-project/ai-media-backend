/** บทบาทของข้อความในบทสนทนา (ตรงกับ OpenAI-compatible API ของ gateway) */
export type LlmMessageRole = 'system' | 'user' | 'assistant' | 'tool';

/** ข้อความ 1 ชิ้นที่ส่งให้โมเดล — content เป็น array ได้เมื่อส่งรูปร่วมด้วย */
export interface LlmMessage {
  role: LlmMessageRole;
  content: string | unknown[] | null;
  name?: string;
  tool_call_id?: string;
  tool_calls?: unknown[];
}

/** จำนวน token ที่ gateway รายงานกลับมา */
export interface LlmUsage {
  readonly promptTokens: number;
  readonly completionTokens: number;
  readonly totalTokens: number;
}

/**
 * option ต่อโมเดลที่เก็บใน `chat_model_config.send_config`
 *
 * รูปเดียวกับ `master_model_type.send_config` ที่ generate image/video ใช้ เพื่อให้
 * สองตารางอ่านด้วยตรรกะเดียวกัน
 */
export interface ChatSendConfig {
  /** Content-Type ของคำขอ (default `application/json`) */
  readonly configType?: string;
  /** `false` = ปลายทางนี้ไม่รองรับ stream ผู้เรียกต้องตกไปใช้แบบรอจนจบ */
  readonly stream?: boolean;
  /** ทับ LLM_CHAT_TIMEOUT_MS เฉพาะโมเดลนี้ */
  readonly timeoutMs?: number;
  /** header เพิ่มเติม — ทับ Authorization ไม่ได้ */
  readonly headers?: Record<string, string>;
  /** field เพิ่มเติมใน body เช่น top_p, reasoning_effort */
  readonly extraBody?: Record<string, unknown>;
  /**
   * token สำรองของโมเดลนี้ ใช้เมื่อ org ยังไม่มี key ของตัวเอง
   *
   * ลำดับเดียวกับ generate image (`generate-image.service.ts` buildQueueJobData):
   * key ของ org มาก่อนเสมอ ค่านี้เป็นตัวสำรอง — ค่าใช้จ่ายที่วิ่งผ่าน token นี้
   * จะไม่ถูกผูกกับ org ใดที่ฝั่ง gateway
   */
  readonly authorization?: string;
}

/** ปลายทางและ option ของโมเดลหนึ่งตัว ตามที่เก็บใน chat_model_config */
export interface LlmEndpoint {
  /** ปลายทางเต็มจาก chat_model_config.send_api — ไม่ระบุ = ใช้ค่าจาก env */
  readonly sendApi?: string;
  readonly sendConfig?: ChatSendConfig;
}

/** พารามิเตอร์ของคำขอ 1 ครั้ง */
export interface LlmChatRequest extends LlmEndpoint {
  /** key ของ org ที่เรียก — gateway ใช้ผูกค่าใช้จ่ายกับ org นี้ */
  readonly apiKey: string;
  readonly model: string;
  readonly messages: readonly LlmMessage[];
  readonly temperature?: number;
  readonly maxTokens?: number;
  readonly tools?: readonly unknown[];
}

/** ผลลัพธ์ของคำขอแบบรอจนจบ */
export interface LlmChatResult {
  readonly content: string;
  readonly finishReason: string | null;
  readonly toolCalls: unknown[] | null;
  /** โมเดลที่ gateway ใช้จริง — อาจต่างจากที่ขอไปเพราะ gateway route เอง */
  readonly model: string;
  readonly usage: LlmUsage;
}

/** ชิ้นส่วนที่ทยอยส่งกลับระหว่าง stream */
export type LlmStreamEvent =
  | { readonly type: 'delta'; readonly content: string }
  | { readonly type: 'usage'; readonly usage: LlmUsage; readonly model: string };

/**
 * error จาก gateway ที่บอกได้ว่าควร retry หรือไม่
 *
 * `retryable` เป็นตัวตัดสินแทนการเดาจาก status ที่จุดเรียก — 429 กับ 5xx ลองใหม่ได้,
 * ส่วน 4xx อื่น (payload ผิด, โมเดลไม่อยู่ใน allowlist ของ key) ลองกี่ครั้งก็ได้ผลเดิม
 */
export class LlmChatError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly retryable: boolean,
    readonly providerPayload?: unknown,
  ) {
    super(message);
    this.name = 'LlmChatError';
  }
}
