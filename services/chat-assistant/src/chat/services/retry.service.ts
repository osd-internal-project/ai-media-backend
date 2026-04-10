import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { AxiosRequestConfig } from 'axios';

export interface LlmCallOptions {
  baseUrl: string;
  apiKey: string;
  model: string;
  fallbackModel: string;
  maxRetries: number;
  timeoutMs: number;
  payload: Record<string, any>;
}

export interface LlmResponse {
  data: any;
  usedModel: string;
  isFromFallback: boolean;
}

@Injectable()
export class RetryService {
  private readonly logger = new Logger(RetryService.name);

  constructor(private readonly httpService: HttpService) {}

  /**
   * Call the LLM with exponential back-off.
   * Falls back to the fallbackModel after all retries on the primary model fail.
   */
  async callWithRetry(options: LlmCallOptions): Promise<LlmResponse> {
    const models = [options.model, options.fallbackModel];

    for (let modelIdx = 0; modelIdx < models.length; modelIdx++) {
      const model = models[modelIdx];
      const isLastModel = modelIdx === models.length - 1;
      const payload = { ...options.payload, model };

      for (let attempt = 1; attempt <= options.maxRetries; attempt++) {
        try {
          this.logger.debug(
            `LLM call attempt ${attempt}/${options.maxRetries} with model: ${model}`,
          );

          const axiosConfig: AxiosRequestConfig = {
            headers: {
              Authorization: `Bearer ${options.apiKey}`,
              'Content-Type': 'application/json',
            },
            timeout: options.timeoutMs,
          };

          const response = await firstValueFrom(
            this.httpService.post(
              `${options.baseUrl}/chat/completions`,
              payload,
              axiosConfig,
            ),
          );

          return {
            data: response.data,
            usedModel: model,
            isFromFallback: modelIdx > 0,
          };
        } catch (err: any) {
          const status = err?.response?.status;
          const isRetryable = !status || status >= 500 || status === 429;

          this.logger.warn(
            `LLM call failed (model=${model}, attempt=${attempt}, status=${status}): ${err.message}`,
          );

          // Don't retry on 4xx (except 429)
          if (!isRetryable) {
            break;
          }

          // If more retries remain, wait with exponential back-off
          if (attempt < options.maxRetries) {
            const waitMs = Math.min(1000 * 2 ** (attempt - 1), 8000);
            this.logger.debug(`Retrying in ${waitMs}ms…`);
            await new Promise((r) => setTimeout(r, waitMs));
          } else if (!isLastModel) {
            this.logger.warn(`Exhausted retries for model ${model}. Falling back to ${models[modelIdx + 1]}`);
          } else {
            throw new Error(
              `LLM call failed after ${options.maxRetries} attempts on model ${model}: ${err.message}`,
            );
          }
        }
      }
    }

    // Should never reach here
    throw new Error('LLM call failed: all models exhausted');
  }
}
