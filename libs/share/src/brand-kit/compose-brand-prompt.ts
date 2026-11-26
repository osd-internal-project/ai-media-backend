export interface BrandKitStyle {
  mood?: string;
  look?: string;
  lighting?: string;
  mustHave?: string[];
}

export interface BrandPromptKit {
  /** 1 = send `brandCiPrompt` as written (kits older than the composer), 2 = compose from records */
  promptVersion: number;
  brandCiPrompt?: string | null;
  negativePrompt?: string | null;
  customPrompt?: string | null;
  style?: BrandKitStyle | null;
}

export interface BrandPromptDetail {
  name: string;
  type: string;
  detail?: unknown;
  sortOrder?: number;
  includeInPrompt?: boolean;
}

export interface BrandPromptLimits {
  /** characters the kit may add to the user's prompt */
  brandKitBudget: number;
  /** request field the model takes a negative prompt in; unset = no such field */
  negativePromptParam?: string;
}

export interface BrandPrompt {
  /** text appended to the user's prompt; '' when the kit has nothing to say */
  text: string;
  /** negative prompt to send in `negativePromptParam`; '' when it is already inside `text` or absent */
  avoid: string;
  usedChars: number;
  /** labels of what was left out to fit the budget, least important first */
  dropped: string[];
}

interface Atom {
  group: Group;
  label: string;
  text: string;
}

// keep-priority, most important first; trimming removes from the end of the last non-empty group
const GROUPS = [
  'primary',
  'secondary',
  'accent',
  'neutral',
  'background',
  'style',
  'mustHave',
  'custom',
  'typography',
] as const;
type Group = (typeof GROUPS)[number];
const COLOR_GROUPS: readonly Group[] = GROUPS.slice(0, 5);

const clean = (value: unknown): string =>
  typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';

const field = (detail: unknown, key: string): string =>
  detail && typeof detail === 'object'
    ? clean((detail as Record<string, unknown>)[key])
    : '';

function toAtoms(kit: BrandPromptKit, details: BrandPromptDetail[]): Atom[] {
  const atoms: Atom[] = [];
  const included = details
    .filter((d) => d.includeInPrompt !== false)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

  for (const d of included) {
    const name = clean(d.name);
    if (d.type === 'colors') {
      const hex = field(d.detail, 'hex').toUpperCase();
      if (!hex) continue;
      const role = field(d.detail, 'type') as Group;
      atoms.push({
        group: COLOR_GROUPS.includes(role) ? role : 'accent',
        label: name || hex,
        text: name ? `${name} (${hex})` : hex,
      });
    } else if (d.type === 'typography' && name) {
      const meta = [
        field(d.detail, 'type'),
        field(d.detail, 'weight') && `weight ${field(d.detail, 'weight')}`,
      ].filter(Boolean);
      atoms.push({
        group: 'typography',
        label: name,
        text: meta.length ? `${name} (${meta.join(', ')})` : name,
      });
    }
  }

  const style = kit.style ?? {};
  for (const key of ['mood', 'look', 'lighting'] as const) {
    const value = clean(style[key]);
    if (value) atoms.push({ group: 'style', label: key, text: value });
  }
  // `style` comes from a JSON column, so its shape is not guaranteed
  for (const item of Array.isArray(style.mustHave) ? style.mustHave : []) {
    const value = clean(item);
    if (value) atoms.push({ group: 'mustHave', label: value, text: value });
  }
  const custom = clean(kit.customPrompt);
  if (custom) atoms.push({ group: 'custom', label: 'custom text', text: custom });
  return atoms;
}

function render(atoms: Atom[], avoidSentence: string): string {
  const of = (group: Group) =>
    atoms.filter((a) => a.group === group).map((a) => a.text);
  const sentence = (lead: string, parts: string[]) =>
    parts.length ? `${lead}${parts.join(', ')}.` : '';

  const palette = COLOR_GROUPS.filter((g) => of(g).length)
    .map((g) => `${g}: ${of(g).join(', ')}`)
    .join('; ');
  const custom = of('custom')[0] ?? '';

  return [
    palette && `Brand palette — ${palette}.`,
    sentence('Style: ', of('style')),
    sentence('Must include: ', of('mustHave')),
    custom && (/[.!?]$/.test(custom) ? custom : `${custom}.`),
    sentence('Typography: ', of('typography')),
    avoidSentence,
  ]
    .filter(Boolean)
    .join(' ');
}

/**
 * Builds the text a brand kit adds to a prompt, trimmed whole item by whole item to the model's budget.
 * The avoid list is never trimmed: leaving it out would let through what the brand ruled out.
 */
export function composeBrandPrompt(
  kit: BrandPromptKit,
  details: BrandPromptDetail[],
  limits: BrandPromptLimits,
): BrandPrompt {
  const negative = clean(kit.negativePrompt);
  const asParam = Boolean(limits.negativePromptParam);
  const avoidSentence =
    negative && !asParam
      ? `Avoid: ${negative}${/[.!?]$/.test(negative) ? '' : '.'}`
      : '';
  const avoid = asParam ? negative : '';

  if (kit.promptVersion !== 2) {
    const text = [clean(kit.brandCiPrompt), avoidSentence]
      .filter(Boolean)
      .join(' ');
    return { text, avoid, usedChars: text.length, dropped: [] };
  }

  const atoms = toAtoms(kit, details);
  const dropped: string[] = [];
  let text = render(atoms, avoidSentence);
  while (text.length > limits.brandKitBudget && atoms.length) {
    const group = [...GROUPS]
      .reverse()
      .find((g) => atoms.some((a) => a.group === g)) as Group;
    const index = atoms.map((a) => a.group).lastIndexOf(group);
    dropped.push(atoms.splice(index, 1)[0].label);
    text = render(atoms, avoidSentence);
  }
  return { text, avoid, usedChars: text.length, dropped };
}
