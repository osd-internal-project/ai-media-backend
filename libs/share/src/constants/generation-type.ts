/**
 * Single source of truth for AI generation types.
 *
 * Three vocabularies exist across the stack for the same categories, so every
 * mapping between them lives here:
 *  - `dbValue`  what is actually stored in `log.type_generate` / `gallery.type_generate`.
 *               Note `omnihuman` is persisted as the misspelling `omnihumen`; that is the
 *               historical value written by the generate services and the worker, and it is
 *               deliberately NOT migrated here.
 *  - `key`      the canonical key every API response and query param uses.
 *  - `label`    the human-readable label for UI surfaces.
 */
export const GENERATION_TYPES = [
  { key: 'image', dbValue: 'image', label: 'Image' },
  { key: 'video', dbValue: 'video', label: 'Video' },
  { key: 'omnihuman', dbValue: 'omnihumen', label: 'OmniHuman' },
  { key: 'dreamactor', dbValue: 'dreamactor', label: 'DreamActor' },
  { key: 'audio', dbValue: 'audio', label: 'Audio' },
] as const;

export type GenerationTypeKey = (typeof GENERATION_TYPES)[number]['key'];

/** Canonical keys in display order. Safe to use to build SQL column lists. */
export const GENERATION_TYPE_KEYS: readonly GenerationTypeKey[] =
  GENERATION_TYPES.map((type) => type.key);

/** Canonical key -> the literal stored in the database. */
export const DB_VALUE_BY_KEY: Readonly<Record<GenerationTypeKey, string>> =
  GENERATION_TYPES.reduce(
    (acc, type) => ({ ...acc, [type.key]: type.dbValue }),
    {} as Record<GenerationTypeKey, string>,
  );

/**
 * Database literal -> canonical key. Both spellings of omnihuman are accepted so rows
 * written by any historical code path normalise to the same key.
 */
export const KEY_BY_DB_VALUE: Readonly<Record<string, GenerationTypeKey>> = {
  ...GENERATION_TYPES.reduce(
    (acc, type) => ({ ...acc, [type.dbValue]: type.key }),
    {} as Record<string, GenerationTypeKey>,
  ),
  omnihuman: 'omnihuman',
};

/**
 * Every stored literal (lower-case) that normalises to `key`, aliases included.
 *
 * @param key Canonical generation type key.
 * @returns The `type_generate` values to match for that key.
 */
export function dbValuesForKey(key: GenerationTypeKey): string[] {
  return Object.keys(KEY_BY_DB_VALUE).filter(
    (value) => KEY_BY_DB_VALUE[value] === key,
  );
}

/**
 * Normalises a raw `type_generate` value into a canonical key.
 *
 * @param dbValue Raw value read from the database; may be null for legacy rows.
 * @returns The canonical generation type key, or null when the value is unknown/absent.
 */
export function toGenerationTypeKey(
  dbValue: string | null | undefined,
): GenerationTypeKey | null {
  if (!dbValue) return null;
  return KEY_BY_DB_VALUE[dbValue.toLowerCase()] ?? null;
}
