import { z } from 'zod';
import raw from './catalogue.json';

/**
 * The activity catalogue (docs/product "Buddy Club activity catalogue", 2026-10-22): every
 * category, activity and level ladder, defined once in `catalogue.json`. The database is seeded
 * from it; the API validates levels against it; the web renders tiles, search and pickers from
 * it. Ids are stable forever: a label is a catalogue edit, an id change fails the build.
 */

const IdSchema = z.string().regex(/^[a-z_]{2,32}$/);

export const PickOptionSchema = z.object({
  id: IdSchema,
  label: z.string(),
  hint: z.string().optional(),
});
export type PickOption = z.infer<typeof PickOptionSchema>;

/** A named set in `levelSets`, or an inline ladder on the activity itself. */
export const LevelSetSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('pick'), options: z.array(PickOptionSchema).min(2).max(8) }),
  z.object({ kind: z.literal('certification'), options: z.array(z.string().min(1)).min(2).max(8) }),
  z.object({ kind: z.literal('grade'), options: z.array(z.string().min(1)).min(2).max(8) }),
  z.object({ kind: z.literal('handicap'), min: z.int(), max: z.int() }),
  z.object({ kind: z.literal('none') }),
]);
export type LevelSet = z.infer<typeof LevelSetSchema>;

export const CatalogueCategorySchema = z.object({
  id: IdSchema,
  name: z.string(),
  sortOrder: z.int(),
  swatch: z.int().min(0).max(6).optional(),
});
export type CatalogueCategory = z.infer<typeof CatalogueCategorySchema>;

export const CatalogueActivitySchema = z.object({
  id: IdSchema,
  name: z.string(),
  category: IdSchema,
  /** A named set, or an inline ladder. */
  levels: z.union([z.string(), LevelSetSchema]),
  featured: z.boolean().optional(),
  tier: z.int().min(1).max(3).optional(),
  /** Rally uses this for racket sports; 1 elsewhere. */
  playersPerSide: z.int().min(1).max(11).optional(),
  /** Other words people type for it. Lowercase. */
  aliases: z.array(z.string()).optional(),
});
export type CatalogueActivity = z.infer<typeof CatalogueActivitySchema>;

export const CatalogueSchema = z.object({
  levelSets: z.record(z.string(), LevelSetSchema),
  categories: z.array(CatalogueCategorySchema),
  activities: z.array(CatalogueActivitySchema),
});
export type Catalogue = z.infer<typeof CatalogueSchema>;

export const CATALOGUE: Catalogue = CatalogueSchema.parse(raw);

/** The welcome and profile screens show at most this many featured tiles. */
export const FEATURED_CAP = 12;

const byId = new Map(CATALOGUE.activities.map((a) => [a.id, a]));
const categoriesById = new Map(CATALOGUE.categories.map((c) => [c.id, c]));

export function activityById(id: string): CatalogueActivity | undefined {
  return byId.get(id);
}

export function categoryById(id: string): CatalogueCategory | undefined {
  return categoriesById.get(id);
}

export function categoryOf(activityId: string): CatalogueCategory | undefined {
  const a = byId.get(activityId);
  return a ? categoriesById.get(a.category) : undefined;
}

/** Featured activities, tier first, then name. */
export function featured(): CatalogueActivity[] {
  return CATALOGUE.activities
    .filter((a) => a.featured)
    .sort((a, b) => (a.tier ?? 9) - (b.tier ?? 9) || a.name.localeCompare(b.name));
}

/** The resolved ladder for an activity. Unknown activities answer `none`. */
export function levelsFor(activityId: string): LevelSet {
  const a = byId.get(activityId);
  if (!a) return { kind: 'none' };
  if (typeof a.levels === 'string') return CATALOGUE.levelSets[a.levels] ?? { kind: 'none' };
  return a.levels;
}

/** Whether a stored level value is one this activity's ladder allows. */
export function isValidLevel(activityId: string, value: string | null | undefined): boolean {
  if (value === null || value === undefined || value === '') return true;
  const set = levelsFor(activityId);
  switch (set.kind) {
    case 'none':
      return false;
    case 'pick':
      return set.options.some((o) => o.id === value);
    case 'certification':
    case 'grade':
      return set.options.includes(value);
    case 'handicap': {
      const n = Number(value);
      return Number.isInteger(n) && n >= set.min && n <= set.max;
    }
  }
}

/** The words shown for a stored level, or the value itself when it is a number. */
export function levelLabel(activityId: string, value: string | null): string | null {
  if (value === null) return null;
  const set = levelsFor(activityId);
  if (set.kind === 'pick') return set.options.find((o) => o.id === value)?.label ?? value;
  if (set.kind === 'handicap') return `Handicap ${value}`;
  return value;
}

/** Lowercase, letters and digits only, for matching typed names against the catalogue. */
export function normaliseName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/** Exact match of a typed name against names, ids and aliases. */
export function matchActivity(name: string): CatalogueActivity | undefined {
  const key = normaliseName(name);
  if (!key) return undefined;
  return CATALOGUE.activities.find(
    (a) =>
      normaliseName(a.name) === key ||
      a.id.replace(/_/g, ' ') === key ||
      (a.aliases ?? []).some((alias) => normaliseName(alias) === key),
  );
}

/** Type-ahead over the whole catalogue: name, id and aliases, best matches first. */
export function searchActivities(query: string, limit = 12): CatalogueActivity[] {
  const key = normaliseName(query);
  if (!key) return [];
  const scored = CATALOGUE.activities
    .filter((a) => a.id !== 'other')
    .map((a) => {
      const name = normaliseName(a.name);
      const words = [name, a.id.replace(/_/g, ' '), ...(a.aliases ?? []).map(normaliseName)];
      let score = 0;
      if (name === key) score = 4;
      else if (name.startsWith(key)) score = 3;
      else if (words.some((w) => w === key || w.startsWith(key))) score = 2;
      else if (words.some((w) => w.includes(key))) score = 1;
      return { a, score };
    })
    .filter((x) => x.score > 0)
    .sort(
      (x, y) =>
        y.score - x.score ||
        Number(!!y.a.featured) - Number(!!x.a.featured) ||
        x.a.name.length - y.a.name.length ||
        x.a.name.localeCompare(y.a.name),
    );
  return scored.slice(0, limit).map((x) => x.a);
}
