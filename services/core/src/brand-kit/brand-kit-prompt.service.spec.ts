import {
  BrandKitPromptService,
  brandLimitsFor,
} from './brand-kit-prompt.service';

const KIT_ID = '7f1c2a34-5b6d-4e8f-9a0b-1c2d3e4f5a6b';

const setup = (kit: Record<string, unknown> | null) => {
  const brandKitRepo = {
    findOne: jest.fn(async ({ where }) =>
      kit && where.id === KIT_ID && (!where.organizationId || where.organizationId === 'org-a')
        ? { id: KIT_ID, organizationId: 'org-a', promptVersion: 2, ...kit }
        : null,
    ),
  };
  const brandKitDetailRepo = {
    findMany: jest.fn(async () => [
      { name: 'Vibrant Pink', type: 'colors', detail: { hex: '#D62A84', type: 'primary' } },
    ]),
  };
  const masterModelTypeRepo = {
    findMany: jest.fn(async () => [
      { id: 1, modelType: 'seedream-4-5', name: 'Seedream 4.5', type: 'image', sendConfig: null },
      { id: 2, modelType: 'omni', name: 'OmniHuman', type: 'omnihumen', sendConfig: { brandKitBudget: 20 } },
    ]),
  };
  const brandKitService = { getKitFor: jest.fn(async () => ({})) };
  const service = new BrandKitPromptService(
    brandKitRepo as never,
    brandKitDetailRepo as never,
    masterModelTypeRepo as never,
    brandKitService as never,
  );
  return { service, brandKitService };
};

const IMAGE = { type: 'image', sendConfig: null };

describe('brandLimitsFor', () => {
  it('uses the per-type fallback, lets send_config override it, and knows no limits for audio', () => {
    expect(brandLimitsFor(IMAGE)).toEqual({
      promptMaxChars: 5000,
      brandKitBudget: 600,
      negativePromptParam: undefined,
    });
    expect(
      brandLimitsFor({
        type: 'video',
        sendConfig: { promptMaxChars: 4000, negativePromptParam: 'negative_prompt' },
      }),
    ).toEqual({
      promptMaxChars: 4000,
      brandKitBudget: 500,
      negativePromptParam: 'negative_prompt',
    });
    expect(brandLimitsFor({ type: 'audio' })).toBeNull();
  });
});

describe('BrandKitPromptService.applyToGenerate', () => {
  it('leaves a request without brandKitId untouched', async () => {
    const { service } = setup({});
    const body = { prompt: 'a cat', organizationId: 'org-a' };
    await expect(service.applyToGenerate(body, IMAGE)).resolves.toBeNull();
    expect(body).toEqual({ prompt: 'a cat', organizationId: 'org-a' });
  });

  it('appends the kit text and keeps both halves for the gallery record', async () => {
    const { service } = setup({ negativePrompt: 'clutter' });
    const body: Record<string, unknown> = {
      prompt: '  a cat  ',
      organizationId: 'org-a',
      brandKitId: KIT_ID,
    };
    await expect(service.applyToGenerate(body, IMAGE)).resolves.toBeNull();
    expect(body.userPrompt).toBe('a cat');
    expect(body.brandPrompt).toBe(
      'Brand palette — primary: Vibrant Pink (#D62A84). Avoid: clutter.',
    );
    expect(body.prompt).toBe(
      'a cat\n\nBrand palette — primary: Vibrant Pink (#D62A84). Avoid: clutter.',
    );
  });

  it('sends the avoid list in the model\'s own field when it has one', async () => {
    const { service } = setup({ negativePrompt: 'clutter' });
    const body: Record<string, unknown> = {
      prompt: 'a cat',
      organizationId: 'org-a',
      brandKitId: KIT_ID,
    };
    await service.applyToGenerate(body, {
      type: 'image',
      sendConfig: { negativePromptParam: 'negative_prompt' },
    });
    expect(body.negative_prompt).toBe('clutter');
    expect(body.prompt).toBe(
      'a cat\n\nBrand palette — primary: Vibrant Pink (#D62A84).',
    );
  });

  it('refuses a kit from another organization, a malformed id, and a model with no kit support', async () => {
    const { service } = setup({});
    const refused = { status: 400, data: expect.stringContaining('Brand kit not found') };
    await expect(
      service.applyToGenerate(
        { prompt: 'x', organizationId: 'org-b', brandKitId: KIT_ID },
        IMAGE,
      ),
    ).resolves.toEqual(refused);
    await expect(
      service.applyToGenerate(
        { prompt: 'x', organizationId: 'org-a', brandKitId: 'not-a-uuid' },
        IMAGE,
      ),
    ).resolves.toEqual(refused);
    await expect(
      service.applyToGenerate(
        { prompt: 'x', organizationId: 'org-a', brandKitId: KIT_ID },
        { type: 'audio' },
      ),
    ).resolves.toEqual({ status: 400, data: 'This model does not take a brand kit' });
  });

  it('rejects, without changing the prompt, when prompt plus kit passes the model limit', async () => {
    const { service } = setup({});
    const body = {
      prompt: 'x'.repeat(1990),
      organizationId: 'org-a',
      brandKitId: KIT_ID,
    };
    const result = await service.applyToGenerate(body, { type: 'omnihumen' });
    expect(result?.status).toBe(400);
    expect(result?.data).toMatch(/^PROMPT_TOO_LONG: .* 40 over this model's limit of 2000$/);
    expect(body.prompt).toHaveLength(1990);
  });
});

describe('BrandKitPromptService.preview', () => {
  it('checks read access, then reports the text and budget per active model', async () => {
    const { service, brandKitService } = setup({});
    const user = { userId: 'u', token: 't', role: null };
    const rows = await service.preview(user, KIT_ID);
    expect(brandKitService.getKitFor).toHaveBeenCalledWith(user, KIT_ID, 'read');
    expect(rows).toEqual([
      expect.objectContaining({
        modelType: 'seedream-4-5',
        brandKitBudget: 600,
        promptMaxChars: 5000,
        text: 'Brand palette — primary: Vibrant Pink (#D62A84).',
        usedChars: 48,
        dropped: [],
      }),
      expect.objectContaining({
        modelType: 'omni',
        brandKitBudget: 20,
        text: '',
        dropped: ['Vibrant Pink'],
      }),
    ]);
  });
});
