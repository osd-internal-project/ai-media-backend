import { Injectable } from '@nestjs/common';
import {
  AuthUser,
  BrandKitDetailRepository,
  BrandKitRepository,
  BrandKitStyle,
  BrandPromptLimits,
  MasterdataModelTypeRepository,
  composeBrandPrompt,
  parseBrandKitKey,
} from '@ai-media/share';
import { isUUID } from 'class-validator';
import { BrandKitService, DETAIL_ORDER } from './brand-kit.service';

export interface BrandModelLimits extends BrandPromptLimits {
  /** the user's prompt plus the kit's text may not exceed this */
  promptMaxChars: number;
}

// Used until a model row carries its own values in `send_config`. The prompt maximums mirror
// the form fields; the kit budgets are a starting point, not yet tuned against real output.
const FALLBACK_LIMITS: Record<string, BrandModelLimits> = {
  image: { promptMaxChars: 5000, brandKitBudget: 600 },
  video: { promptMaxChars: 8000, brandKitBudget: 500 },
  omnihumen: { promptMaxChars: 2000, brandKitBudget: 300 },
  dreamactor: { promptMaxChars: 2000, brandKitBudget: 300 },
};

const IMAGE_DETAIL_TYPES = ['logo', 'style_ref'];
/** style images a kit may add to one generation */
const MAX_KIT_REFS = 2;

const positive = (value: unknown, fallback: number) =>
  typeof value === 'number' && value > 0 ? value : fallback;

/** Limits for one model: `send_config` keys win, the per-type fallback fills the rest. */
export function brandLimitsFor(model: {
  type?: string | null;
  sendConfig?: unknown;
}): BrandModelLimits | null {
  const fallback = FALLBACK_LIMITS[model.type ?? ''];
  if (!fallback) return null;
  const config: Record<string, unknown> =
    model.sendConfig && typeof model.sendConfig === 'object'
      ? { ...model.sendConfig }
      : {};
  return {
    promptMaxChars: positive(config.promptMaxChars, fallback.promptMaxChars),
    brandKitBudget: positive(config.brandKitBudget, fallback.brandKitBudget),
    negativePromptParam:
      typeof config.negativePromptParam === 'string' &&
      config.negativePromptParam
        ? config.negativePromptParam
        : undefined,
  };
}

/** Body fields this service reads and writes on a generate request. */
interface GenerateBody {
  brandKitId?: unknown;
  /** object keys of this kit's style images to send as reference images (image models only) */
  brandKitRefs?: unknown;
  image?: unknown;
  organizationId?: string;
  prompt?: unknown;
  userPrompt?: string;
  brandPrompt?: string;
  [field: string]: unknown;
}

@Injectable()
export class BrandKitPromptService {
  constructor(
    private readonly brandKitRepo: BrandKitRepository,
    private readonly brandKitDetailRepo: BrandKitDetailRepository,
    private readonly masterModelTypeRepo: MasterdataModelTypeRepository,
    private readonly brandKitService: BrandKitService,
  ) {}

  private async loadKit(where: { id: string; organizationId?: string }) {
    const kit = await this.brandKitRepo.findOne({ where });
    if (!kit) return null;
    const details = await this.brandKitDetailRepo.findMany({
      where: { brandKitId: kit.id },
      orderBy: DETAIL_ORDER,
    });
    return {
      kit: {
        promptVersion: kit.promptVersion,
        brandCiPrompt: kit.brandCiPrompt,
        negativePrompt: kit.negativePrompt,
        customPrompt: kit.customPrompt,
        // JSON column: composeBrandPrompt ignores anything that is not the expected shape
        style: kit.style as BrandKitStyle | null,
      },
      details,
    };
  }

  /**
   * Adds the kit's text to `body.prompt` for a generate request that names a `brandKitId`.
   * A request without one is left exactly as it arrived.
   * @returns an error response to send back, or null when the request may continue
   */
  async applyToGenerate(
    body: GenerateBody,
    model: { type?: string | null; sendConfig?: unknown },
  ): Promise<{ status: number; data: string } | null> {
    if (!body.brandKitId) return null;
    const notFound = {
      status: 400,
      data: 'Brand kit not found in this organization, please reload',
    };
    if (!isUUID(body.brandKitId) || !body.organizationId) return notFound;
    const limits = brandLimitsFor(model);
    if (!limits) {
      return { status: 400, data: 'This model does not take a brand kit' };
    }
    const loaded = await this.loadKit({
      id: String(body.brandKitId),
      organizationId: body.organizationId,
    });
    if (!loaded) return notFound;

    const brand = composeBrandPrompt(loaded.kit, loaded.details, limits);
    const refs = model.type === 'image' ? this.kitRefs(body, loaded.details) : [];
    const userPrompt =
      typeof body.prompt === 'string' ? body.prompt.trim() : '';
    const prompt = [
      userPrompt,
      brand.text,
      // tells the model what the extra images are for; without it a reference is often copied as content
      refs.length
        ? `Use the last ${refs.length} reference image${
            refs.length === 1 ? '' : 's'
          } for visual style only, not for their subject.`
        : '',
    ]
      .filter(Boolean)
      .join('\n\n');
    if (prompt.length > limits.promptMaxChars) {
      return {
        status: 400,
        data: `PROMPT_TOO_LONG: your prompt plus the brand kit is ${prompt.length} characters, ${
          prompt.length - limits.promptMaxChars
        } over this model's limit of ${limits.promptMaxChars}`,
      };
    }
    body.userPrompt = userPrompt;
    body.brandPrompt = brand.text;
    body.prompt = prompt;
    if (refs.length) {
      // the user's own references stay first
      body.image = [...(Array.isArray(body.image) ? body.image : []), ...refs];
    }
    if (brand.avoid && limits.negativePromptParam) {
      body[limits.negativePromptParam] = brand.avoid;
    }
    return null;
  }

  /** The requested keys that really are images saved on this kit, at most MAX_KIT_REFS of them. */
  private kitRefs(
    body: GenerateBody,
    details: { type: string; detail: unknown }[],
  ): string[] {
    if (!Array.isArray(body.brandKitRefs)) return [];
    const owned = new Set(
      details.flatMap((d) => {
        const key =
          IMAGE_DETAIL_TYPES.includes(d.type) &&
          d.detail &&
          typeof d.detail === 'object'
            ? (d.detail as { key?: unknown }).key
            : undefined;
        return typeof key === 'string' && parseBrandKitKey(key) ? [key] : [];
      }),
    );
    return [...new Set(body.brandKitRefs)]
      .filter((key): key is string => typeof key === 'string' && owned.has(key))
      .slice(0, MAX_KIT_REFS);
  }

  /** What the kit adds for every active model that takes one, for the Brand Prompt card and the form counter. */
  async preview(authUser: AuthUser | undefined, kitId: string) {
    await this.brandKitService.getKitFor(authUser, kitId, 'read');
    const loaded = await this.loadKit({ id: kitId });
    if (!loaded) return [];
    const models = await this.masterModelTypeRepo.findMany({
      where: { isActive: true, type: { in: Object.keys(FALLBACK_LIMITS) } },
      orderBy: { id: 'asc' },
    });
    return models.flatMap((model) => {
      const limits = brandLimitsFor(model);
      if (!limits) return [];
      return [
        {
          modelId: model.id,
          modelType: model.modelType,
          name: model.name,
          type: model.type,
          promptMaxChars: limits.promptMaxChars,
          brandKitBudget: limits.brandKitBudget,
          ...composeBrandPrompt(loaded.kit, loaded.details, limits),
        },
      ];
    });
  }
}
