import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosRequestConfig } from 'axios';
import * as https from 'https';
import {
  LlmChatError,
  LlmChatRequest,
  LlmChatResult,
  LlmEndpoint,
  LlmStreamEvent,
  LlmUsage,
} from './llm-chat.types';

/** จำนวนครั้งที่ลองใหม่เมื่อเจอ error ที่ลองใหม่แล้วมีโอกาสสำเร็จ */
const MAX_ATTEMPTS = 3;

/** เพดานเวลารอ backoff ต่อครั้ง (ms) */
const MAX_BACKOFF_MS = 8_000;

/** timeout เริ่มต้นของคำขอแบบรอจนจบ (ms) */
const DEFAULT_TIMEOUT_MS = 60_000;

/** usage ที่ยังไม่รู้ค่า — ใช้เมื่อ gateway ไม่ส่ง usage กลับมา */
/**
 * config ของ axios ที่เผื่อ `signal` ไว้เอง
 *
 * libs/share ไม่ได้ประกาศ axios เป็น dependency ของตัวเอง เวลา build ใน image
 * จึงมีโอกาสไปคว้า axios 0.21 ที่ hoist มาจาก @volcengine/tos-sdk ซึ่ง type
 * ยังไม่มี `signal` (เพิ่มเข้ามาใน 0.22) — ประกาศทับไว้ตรงนี้ให้ compile ผ่าน
 * ทั้งสองเวอร์ชัน
 */
type LlmRequestConfig = AxiosRequestConfig & { signal?: AbortSignal };

const EMPTY_USAGE: LlmUsage = {
  promptTokens: 0,
  completionTokens: 0,
  totalTokens: 0,
};

/**
 * client เดียวของระบบที่คุยกับ `POST {gateway}/api/v1/chat/completions`
 *
 * gateway พูด OpenAI-compatible ทั้ง request และ response ต่างกันที่ credential:
 * ที่นี่ส่ง key ของ org (จาก LlmGatewayService.getOrCreateApiKey) ไม่ใช่ key กลางใบเดียว
 * ทำให้ค่าใช้จ่ายผูกกับ org ได้จริงที่ฝั่ง gateway
 *
 * ตั้งใจอยู่ใน libs/share ไม่ใช่ใน services/chat-assistant เพราะ service อื่น
 * (เช่นงานสรุป/จัดหมวดใน core) จะเรียกใช้ทางเดียวกันได้โดยไม่ต้องคัดลอกโค้ด
 */
@Injectable()
export class LlmChatService {
  private readonly logger = new Logger(LlmChatService.name);

  /**
   * ค่า config ของ gateway
   *
   * `libs/share` ไม่มี ConfigModule จึงอ่าน env ตรงทุกครั้งเหมือน LlmGatewayService
   * (ดูคอมเมนต์ที่นั่น) — ทำให้เปลี่ยน env แล้วมีผลทันทีโดยไม่ต้อง restart process
   */
  private get config() {
    const env = process.env.NODE_ENV ?? 'local';
    const gatewayUrl =
      process.env.LLM_GATEWAY_URL || 'https://llmgateway.osd.co.th';
    return {
      // แยก env ไว้เผื่อวันหนึ่ง chat กับ control-plane อยู่คนละ host
      // ค่า default อิง LLM_GATEWAY_URL เพื่อให้ key กับปลายทางเป็น host เดียวกันเสมอ
      chatBaseUrl:
        process.env.LLM_CHAT_BASE_URL ||
        `${gatewayUrl.replace(/\/+$/, '')}/api/v1`,
      timeoutMs: Number(process.env.LLM_CHAT_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS),
      rejectUnauthorized: !(env === 'local' || env === 'development'),
    };
  }

  /**
   * เรียกโมเดลแบบรอจนได้คำตอบครบ
   *
   * @param request พารามิเตอร์ของคำขอ
   * @returns เนื้อหาคำตอบ + usage ที่ gateway รายงาน
   * @throws LlmChatError เมื่อเรียกไม่สำเร็จหลังลองครบแล้ว
   */
  async complete(request: LlmChatRequest): Promise<LlmChatResult> {
    const body = this.buildBody(request, false);
    const data = await this.postWithRetry(body, request.apiKey, request);

    const choice = data?.choices?.[0];
    return {
      content: choice?.message?.content ?? '',
      finishReason: choice?.finish_reason ?? null,
      toolCalls: choice?.message?.tool_calls ?? null,
      model: data?.model ?? request.model,
      usage: this.readUsage(data?.usage),
    };
  }

  /**
   * เรียกโมเดลแบบ stream
   *
   * ขอ `stream_options.include_usage` ด้วยเสมอ เพื่อให้ได้ usage จริงจาก gateway
   * ตอนจบ — โค้ดเดิมนับ token เองด้วยการ +1 ต่อ chunk แล้วเขียนลง DB ซึ่งไม่ใช่
   * จำนวน token จริงเลย
   *
   * @param request พารามิเตอร์ของคำขอ
   * @param signal ใช้ยกเลิกเมื่อ client ปิดการเชื่อมต่อ
   * @returns async iterator ของ delta และ usage ก้อนสุดท้าย
   * @throws LlmChatError เมื่อเปิด stream ไม่สำเร็จ
   */
  async *stream(
    request: LlmChatRequest,
    signal?: AbortSignal,
  ): AsyncGenerator<LlmStreamEvent> {
    const body = {
      ...this.buildBody(request, true),
      stream_options: { include_usage: true },
    };

    const response = await this.post(body, request.apiKey, request, {
      responseType: 'stream',
      headers: { Accept: 'text/event-stream' },
      signal,
    });

    let buffer = '';
    for await (const chunk of response.data as AsyncIterable<Buffer>) {
      buffer += chunk.toString('utf8');

      // SSE คั่นแต่ละ event ด้วยบรรทัดว่าง — เก็บเศษท้ายไว้รอ chunk ถัดไป
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;

        const payload = trimmed.slice(5).trim();
        if (payload === '[DONE]') return;

        let parsed: any;
        try {
          parsed = JSON.parse(payload);
        } catch {
          // chunk ที่ตัดครึ่งจะถูกต่อในรอบถัดไป — ข้ามไปเงียบ ๆ ถูกแล้ว
          continue;
        }

        const delta = parsed?.choices?.[0]?.delta?.content;
        if (delta) yield { type: 'delta', content: delta };

        const finishReason = parsed?.choices?.[0]?.finish_reason;
        if (finishReason) yield { type: 'finish', finishReason };

        // usage มาเป็น chunk สุดท้ายเมื่อขอ include_usage ไว้
        if (parsed?.usage) {
          yield {
            type: 'usage',
            usage: this.readUsage(parsed.usage),
            model: parsed?.model ?? request.model,
          };
        }
      }
    }
  }

  /**
   * ปลายทางจริงที่จะถูกยิงสำหรับโมเดลนี้
   *
   * public เพราะหน้าตรวจสถานะต้องรายงานให้ผู้ดูแลเห็นว่าคำขอกำลังจะไปที่ไหน
   * โดยไม่ต้องยิงจริง
   *
   * @param endpoint ปลายทางและ option ของโมเดลที่เลือกไว้
   * @returns URL เต็ม — ค่าจาก send_api ถ้ามี ไม่งั้นประกอบจาก env
   */
  resolveUrl(endpoint: LlmEndpoint): string {
    const sendApi = endpoint.sendApi?.trim();
    if (sendApi) return sendApi;
    return `${this.config.chatBaseUrl}/chat/completions`;
  }

  // ==========================================================================
  // Internals
  // ==========================================================================

  /**
   * ประกอบ body ตามสัญญาของ OpenAI-compatible API
   *
   * `extraBody` จาก sendConfig ถูก spread ไว้บนสุด — field ที่โค้ดประกอบเอง
   * (model, messages, tools, stream) จึงชนะเสมอ ค่าใน DB ที่ตั้งผิดทำให้เพี้ยนได้
   * แค่พารามิเตอร์เสริม ไม่ใช่โครงของคำขอ
   *
   * @param request พารามิเตอร์ของคำขอ
   * @param stream ขอแบบ stream หรือไม่
   * @returns body ที่พร้อมส่ง
   */
  private buildBody(
    request: LlmChatRequest,
    stream: boolean,
  ): Record<string, unknown> {
    return {
      ...request.sendConfig?.extraBody,
      model: request.model,
      messages: request.messages,
      // ส่งเสมอเมื่อมีค่า — โค้ดเดิมไม่ส่ง sampling parameter ใด ๆ บน path ของแชท
      ...(request.temperature !== undefined && {
        temperature: request.temperature,
      }),
      ...(request.maxTokens !== undefined && { max_tokens: request.maxTokens }),
      ...(request.tools?.length ? { tools: request.tools, tool_choice: 'auto' } : {}),
      stream,
    };
  }

  /**
   * ยิงคำขอพร้อม retry แบบ exponential backoff
   *
   * ลองใหม่เฉพาะ error ที่ลองแล้วมีโอกาสต่างออกไป (429, 5xx, network) — 4xx อื่น
   * เช่นโมเดลไม่อยู่ใน allowlist ของ key ลองกี่ครั้งก็ได้ผลเดิม การลองซ้ำมีแต่
   * ทำให้ผู้ใช้รอนานขึ้น
   *
   * @param body body ที่จะส่ง
   * @param apiKey key ของ org
   * @param endpoint ปลายทางและ option ของโมเดลที่เลือกไว้
   * @returns response body ของ gateway
   * @throws LlmChatError เมื่อยังไม่สำเร็จหลังลองครบ
   */
  private async postWithRetry(
    body: Record<string, unknown>,
    apiKey: string,
    endpoint: LlmEndpoint,
  ): Promise<any> {
    let lastError: LlmChatError | null = null;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      try {
        const response = await this.post(body, apiKey, endpoint);
        return response.data;
      } catch (error) {
        lastError =
          error instanceof LlmChatError
            ? error
            : new LlmChatError(String(error), null, true);

        if (!lastError.retryable || attempt === MAX_ATTEMPTS) break;

        const backoff = Math.min(1000 * 2 ** (attempt - 1), MAX_BACKOFF_MS);
        this.logger.warn(
          `chat completion attempt ${attempt} failed (${lastError.status ?? 'network'}), retrying in ${backoff}ms`,
        );
        await new Promise((resolve) => setTimeout(resolve, backoff));
      }
    }

    throw lastError ?? new LlmChatError('Chat completion failed', null, false);
  }

  /**
   * ยิงคำขอ 1 ครั้งและแปลง error ของ axios เป็น LlmChatError
   *
   * credential เรียงแบบเดียวกับ generate image: key ของ org มาก่อน ตกไปใช้
   * `sendConfig.authorization` เมื่อ org ยังไม่มี key ส่วน `sendConfig.headers`
   * ถูก spread ก่อน Authorization เสมอ จึงเขียนทับ credential ไม่ได้
   *
   * @param body body ที่จะส่ง
   * @param apiKey key ของ org
   * @param endpoint ปลายทางและ option ของโมเดลที่เลือกไว้
   * @param overrides ค่า axios เพิ่มเติม (ใช้ตอน stream)
   * @returns response ของ axios
   * @throws LlmChatError เสมอเมื่อไม่สำเร็จ
   */
  private async post(
    body: Record<string, unknown>,
    apiKey: string,
    endpoint: LlmEndpoint,
    overrides: LlmRequestConfig = {},
  ) {
    const { timeoutMs, rejectUnauthorized } = this.config;
    const { sendConfig } = endpoint;

    const axiosConfig: LlmRequestConfig = {
      timeout: sendConfig?.timeoutMs ?? timeoutMs,
      httpsAgent: new https.Agent({ rejectUnauthorized }),
      ...overrides,
      headers: {
        ...sendConfig?.headers,
        Authorization: `Bearer ${apiKey || sendConfig?.authorization || ''}`,
        'Content-Type': sendConfig?.configType ?? 'application/json',
        ...overrides.headers,
      },
    };

    try {
      return await axios.post(this.resolveUrl(endpoint), body, axiosConfig);
    } catch (error:any) {
      const status: number | null = error?.response?.status ?? null;
      const retryable = status === null || status === 429 || status >= 500;
      const data = await this.readErrorBody(error?.response?.data);
      const detail =
        data?.error?.message ??
        data?.message ??
        error?.message ??
        'unknown error';

      throw new LlmChatError(
        `LLM gateway chat completion failed: ${detail}`,
        status,
        retryable,
        data,
      );
    }
  }

  /**
   * อ่าน body ของ error ให้เป็น object
   *
   * คำขอแบบ stream ได้ body เป็น stream แม้ตอน 4xx — ถ้าไม่อ่านออกมา ผู้ใช้จะเห็นแค่
   * "Request failed with status code 400" แทนเหตุผลจริง เช่นโมเดลไม่อยู่ใน allowlist
   *
   * @param data body ดิบจาก axios
   * @returns object ที่ parse แล้ว, `{ message }` เมื่อไม่ใช่ JSON หรือค่าเดิม
   */
  private async readErrorBody(data: any): Promise<any> {
    if (!data || typeof data[Symbol.asyncIterator] !== 'function') return data;
    let text = '';
    try {
      for await (const chunk of data as AsyncIterable<Buffer | string>) {
        text += chunk.toString();
      }
    } catch (error) {
      this.logger.warn(
        `Cannot read gateway error body: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    try {
      return JSON.parse(text);
    } catch {
      return text ? { message: text.slice(0, 500) } : undefined;
    }
  }

  /**
   * อ่าน usage จาก response ของ gateway
   *
   * @param usage ก้อน usage ดิบ (อาจไม่มี)
   * @returns usage ที่ normalize แล้ว
   */
  private readUsage(usage: any): LlmUsage {
    if (!usage) return EMPTY_USAGE;
    return {
      promptTokens: usage.prompt_tokens ?? 0,
      completionTokens: usage.completion_tokens ?? 0,
      totalTokens:
        usage.total_tokens ??
        (usage.prompt_tokens ?? 0) + (usage.completion_tokens ?? 0),
    };
  }
}
