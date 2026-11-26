import {
  BrandPromptDetail,
  BrandPromptKit,
  composeBrandPrompt,
} from './compose-brand-prompt';

const color = (
  name: string,
  hex: string,
  type: string,
  sortOrder = 0,
): BrandPromptDetail => ({ name, type: 'colors', detail: { hex, type }, sortOrder });

const font = (name: string, includeInPrompt: boolean): BrandPromptDetail => ({
  name,
  type: 'typography',
  detail: { type: 'Body', weight: '100' },
  includeInPrompt,
});

const kit = (over: Partial<BrandPromptKit> = {}): BrandPromptKit => ({
  promptVersion: 2,
  ...over,
});

const ROOMY = { brandKitBudget: 1000 };

describe('composeBrandPrompt', () => {
  it('writes colours by role with name and hex, and nothing about any other brand', () => {
    const result = composeBrandPrompt(
      kit(),
      [
        color('Deep Blue', '#155791', 'primary', 2),
        color('Vibrant Pink', '#d62a84', 'primary', 1),
        color('Warm Yellow', '#F0BC4D', 'secondary'),
        color('White', '#FFFFFF', 'background'),
      ],
      ROOMY,
    );
    expect(result.text).toBe(
      'Brand palette — primary: Vibrant Pink (#D62A84), Deep Blue (#155791); secondary: Warm Yellow (#F0BC4D); background: White (#FFFFFF).',
    );
    expect(result.usedChars).toBe(result.text.length);
    expect(result.dropped).toEqual([]);
  });

  it('adds style, must-haves, custom text and only the fonts switched on', () => {
    const result = composeBrandPrompt(
      kit({
        style: { mood: 'playful', look: 'flat illustration', mustHave: ['rounded shapes'] },
        customPrompt: 'Leave room for a headline',
      }),
      [font('DB Helvethaica X', true), font('Sarabun', false)],
      ROOMY,
    );
    expect(result.text).toBe(
      'Style: playful, flat illustration. Must include: rounded shapes. Leave room for a headline. Typography: DB Helvethaica X (Body, weight 100).',
    );
  });

  it('puts the avoid list in the text when the model has no negative field', () => {
    const result = composeBrandPrompt(
      kit({ negativePrompt: 'neon colours, clutter' }),
      [color('Pink', '#D62A84', 'primary')],
      ROOMY,
    );
    expect(result.text).toBe(
      'Brand palette — primary: Pink (#D62A84). Avoid: neon colours, clutter.',
    );
    expect(result.avoid).toBe('');
  });

  it('hands the avoid list back separately when the model has a negative field', () => {
    const result = composeBrandPrompt(
      kit({ negativePrompt: 'neon colours' }),
      [color('Pink', '#D62A84', 'primary')],
      { brandKitBudget: 1000, negativePromptParam: 'negative_prompt' },
    );
    expect(result.text).toBe('Brand palette — primary: Pink (#D62A84).');
    expect(result.avoid).toBe('neon colours');
  });

  it('drops whole items, least important first, until the text fits', () => {
    const details = [
      color('Pink', '#D62A84', 'primary'),
      color('Yellow', '#F0BC4D', 'secondary'),
      color('White', '#FFFFFF', 'background'),
      font('DB Helvethaica X', true),
    ];
    const styled = kit({ style: { mood: 'playful' }, customPrompt: 'Leave room' });

    const result = composeBrandPrompt(styled, details, { brandKitBudget: 75 });
    expect(result.dropped).toEqual([
      'DB Helvethaica X',
      'custom text',
      'mood',
      'White',
    ]);
    expect(result.text).toBe(
      'Brand palette — primary: Pink (#D62A84); secondary: Yellow (#F0BC4D).',
    );
    expect(result.text.length).toBeLessThanOrEqual(75);
  });

  it('never drops the avoid list, even when nothing else fits', () => {
    const result = composeBrandPrompt(
      kit({ negativePrompt: 'neon colours' }),
      [color('Pink', '#D62A84', 'primary')],
      { brandKitBudget: 10 },
    );
    expect(result.text).toBe('Avoid: neon colours.');
    expect(result.dropped).toEqual(['Pink']);
  });

  it('sends a version 1 kit exactly as it was written, plus the avoid list', () => {
    const legacy = 'Brand colors: Pink (primary): #D62A84, Fonts: DB (body), premium quality';
    const result = composeBrandPrompt(
      kit({ promptVersion: 1, brandCiPrompt: legacy, negativePrompt: 'clutter' }),
      [color('Ignored', '#000000', 'primary')],
      { brandKitBudget: 10 },
    );
    expect(result.text).toBe(`${legacy} Avoid: clutter.`);
    expect(result.dropped).toEqual([]);
  });

  it('returns empty text for a kit with nothing set', () => {
    expect(composeBrandPrompt(kit(), [], ROOMY)).toEqual({
      text: '',
      avoid: '',
      usedChars: 0,
      dropped: [],
    });
  });

  it('skips a colour with no hex and files an unknown role under accent', () => {
    const result = composeBrandPrompt(
      kit(),
      [
        { name: 'Broken', type: 'colors', detail: {} },
        color('Teal', '#008080', 'brand-new-role'),
      ],
      ROOMY,
    );
    expect(result.text).toBe('Brand palette — accent: Teal (#008080).');
  });
});
