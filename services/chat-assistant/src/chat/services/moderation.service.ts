import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

export interface ModerationResult {
  flagged: boolean;
  categories: Record<string, boolean>;
  categoryScores: Record<string, number>;
}

@Injectable()
export class ModerationService {
  private readonly logger = new Logger(ModerationService.name);

  constructor(private readonly httpService: HttpService) { }

  /**
   * Check content against the OpenAI Moderation API.
   * Throws BadRequestException if content is flagged.
   */
  async checkAndThrow(
    text: string,
    apiKey: string,
    baseUrl: string,
    enabled: boolean = true,
  ): Promise<void> {
    if (!enabled || !text?.trim()) return;
    console.log(`text`, text)
    console.log(`baseUrl`, baseUrl)

    try {
      const result = await this.check(text, apiKey, baseUrl);
      if (result.flagged) {
        const flaggedCategories = Object.entries(result.categories)
          .filter(([, v]) => v)
          .map(([k]) => k)
          .join(', ');
        this.logger.warn(`Content flagged by moderation: ${flaggedCategories}`);
        throw new BadRequestException(
          `Content was flagged for: ${flaggedCategories}. Please revise your message.`,
        );
      }
    } catch (err: any) {
      if (err instanceof BadRequestException) throw err;
      console.log(`err`, err.response?.data || err.message)
      // Moderation API failure should not block the user — log and continue
      this.logger.error(`Moderation API error (non-blocking): ${err.message}`);
    }
  }

  async check(
    text: string,
    apiKey: string,
    baseUrl: string,
  ): Promise<ModerationResult> {
    const response = await firstValueFrom(
      this.httpService.post(
        `${baseUrl}/moderations`,
        { input: text },
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 10000,
        },
      ),
    );

    const result = response.data?.results?.[0];
    return {
      flagged: result?.flagged ?? false,
      categories: result?.categories ?? {},
      categoryScores: result?.category_scores ?? {},
    };
  }
}
