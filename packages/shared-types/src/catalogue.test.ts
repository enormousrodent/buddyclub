import { describe, expect, it } from 'vitest';
import {
  CATALOGUE,
  FEATURED_CAP,
  featured,
  isValidLevel,
  levelsFor,
  matchActivity,
  normaliseName,
  searchActivities,
} from './catalogue';
import snapshot from './catalogue-ids.json';

/** Guard rails from the catalogue design: stable ids, a capped featured set, ladders that resolve. */
describe('activity catalogue', () => {
  it('never loses or renames an id that shipped before', () => {
    const activities = new Set(CATALOGUE.activities.map((a) => a.id));
    const categories = new Set(CATALOGUE.categories.map((c) => c.id));
    for (const id of snapshot.activities) expect(activities.has(id), `activity ${id}`).toBe(true);
    for (const id of snapshot.categories) expect(categories.has(id), `category ${id}`).toBe(true);
  });

  it('has unique ids, known categories, and ladders that resolve', () => {
    const ids = CATALOGUE.activities.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    const categories = new Set(CATALOGUE.categories.map((c) => c.id));
    for (const a of CATALOGUE.activities) {
      expect(categories.has(a.category), a.id).toBe(true);
      expect(levelsFor(a.id).kind).toBeTruthy();
      if (typeof a.levels === 'string') expect(CATALOGUE.levelSets[a.levels], a.id).toBeDefined();
    }
  });

  it('keeps the featured set small and in a sensible order', () => {
    const list = featured();
    expect(list.length).toBeLessThanOrEqual(FEATURED_CAP);
    expect(list.length).toBeGreaterThan(0);
    expect(list.map((a) => a.id)).toContain('tennis');
    expect(list.map((a) => a.id)).toContain('walking');
  });

  it('keeps the original six racket sports with their players per side', () => {
    for (const id of ['badminton', 'pickleball', 'tennis', 'padel'])
      expect(CATALOGUE.activities.find((a) => a.id === id)?.playersPerSide).toBe(2);
    for (const id of ['squash', 'table_tennis'])
      expect(CATALOGUE.activities.find((a) => a.id === id)?.playersPerSide ?? 1).toBe(1);
  });

  it('validates levels against each activity ladder', () => {
    expect(isValidLevel('tennis', 'comfortable')).toBe(true);
    expect(isValidLevel('tennis', 'once_a_week')).toBe(false);
    expect(isValidLevel('gym', 'once_a_week')).toBe(true);
    expect(isValidLevel('walking', 'big_hills')).toBe(true);
    expect(isValidLevel('walking', 'expert')).toBe(false);
    expect(isValidLevel('scuba', 'Rescue')).toBe(true);
    expect(isValidLevel('scuba', 'Coach')).toBe(false);
    expect(isValidLevel('golf', '18')).toBe(true);
    expect(isValidLevel('golf', '55')).toBe(false);
    expect(isValidLevel('golf', '7.5')).toBe(false);
    expect(isValidLevel('books', null)).toBe(true);
    expect(isValidLevel('books', 'expert')).toBe(false);
  });

  it('matches typed names against names, ids and aliases', () => {
    expect(matchActivity('Tennis')?.id).toBe('tennis');
    expect(matchActivity('ping pong')?.id).toBe('table_tennis');
    expect(matchActivity('D&D')?.id).toBe('tabletop_rpg');
    expect(matchActivity('table-tennis')?.id).toBe('table_tennis');
    expect(matchActivity('underwater hockey')).toBeUndefined();
    expect(normaliseName('  Pétanque!! ')).toBe('petanque');
  });

  it('searches with best matches first', () => {
    const ids = searchActivities('ten').map((a) => a.id);
    expect(ids[0]).toBe('tennis');
    expect(ids).toContain('table_tennis');
    expect(ids).toContain('ten_pin_bowling');
    expect(searchActivities('').length).toBe(0);
    expect(searchActivities('zzzz').length).toBe(0);
  });
});
