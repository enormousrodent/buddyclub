import {
  activityById,
  isValidLevel,
  matchActivity,
  normaliseName,
  type GearItem,
  type MyProfile,
  type ProfileActivity,
  type SetActivitiesBody,
  type SetGearBody,
  type SuggestionResult,
  type UpdateProfileBody,
} from '@buddyclub/shared-types';
import type { Db } from '../../db/index.js';
import type { Actor } from '../../platform/actor.js';
import { recordAudit } from '../../platform/audit.js';
import { toIso } from '../../platform/tokens.js';
import { sql } from 'kysely';
import { AppError } from '../../problems.js';
import type { CommandContext } from '../organisations/service.js';

/**
 * Buddy profiles (Addendum 1.3 step 1): the person's own activities, levels, days and gear.
 * Everything here is read and written by the person it belongs to; nobody else sees it until
 * step 2 adds people search with its visibility rules.
 */

type DbOrTrx = Db | Parameters<Parameters<ReturnType<Db['transaction']>['execute']>[0]>[0];

async function loadActivities(db: DbOrTrx, profileId: string): Promise<ProfileActivity[]> {
  const rows = await db
    .selectFrom('identity.profile_activities as a')
    .innerJoin('community.interests as i', 'i.id', 'a.interest_id')
    .leftJoin('community.sports as s', 's.id', 'a.sport_id')
    .select([
      'a.id',
      'a.interest_id',
      'i.name as interest_name',
      'a.sport_id',
      's.name as sport_name',
      'a.level',
      'a.days',
      'a.note',
      'a.custom_name',
    ])
    .where('a.profile_id', '=', profileId)
    .orderBy('i.sort_order')
    .orderBy('s.name')
    .execute();
  return rows.map((r) => ({
    id: r.id,
    activityId: r.sport_id as string,
    activityName: r.custom_name ?? r.sport_name ?? r.sport_id ?? '',
    interestId: r.interest_id,
    interestName: r.interest_name,
    sportId: r.sport_id as string,
    sportName: r.custom_name ?? r.sport_name ?? r.sport_id ?? '',
    level: r.level,
    days: (r.days as ProfileActivity['days']) ?? {},
    note: r.note,
    customName: r.custom_name,
  }));
}

async function loadGear(db: DbOrTrx, profileId: string): Promise<GearItem[]> {
  const rows = await db
    .selectFrom('identity.profile_gear')
    .select(['id', 'interest_id', 'sport_id', 'name', 'detail', 'sort_order'])
    .where('profile_id', '=', profileId)
    .orderBy('sort_order')
    .orderBy('created_at')
    .execute();
  return rows.map((r) => ({
    id: r.id,
    activityId: r.sport_id ?? r.interest_id,
    interestId: r.interest_id,
    name: r.name,
    detail: r.detail,
    sortOrder: r.sort_order,
  }));
}

export async function getMyProfile(db: Db, actor: Actor): Promise<MyProfile> {
  const row = await db
    .selectFrom('identity.user_profiles')
    .select([
      'id',
      'display_name',
      'avatar_url',
      'locality',
      'bio',
      'discoverable',
      'show_gear',
      'adult_confirmed_at',
      'buddyclub_onboarded_at',
      'rally_onboarded_at',
      'updated_at',
    ])
    .where('id', '=', actor.profileId)
    .executeTakeFirstOrThrow();
  const [activities, gear] = await Promise.all([
    loadActivities(db, actor.profileId),
    loadGear(db, actor.profileId),
  ]);
  return {
    id: row.id,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    locality: row.locality,
    bio: row.bio,
    discoverable: row.discoverable,
    showGear: row.show_gear,
    adultConfirmed: row.adult_confirmed_at !== null,
    onboarded: {
      buddyclub: row.buddyclub_onboarded_at !== null,
      rally: row.rally_onboarded_at !== null,
    },
    activities,
    gear,
    updatedAt: toIso(row.updated_at),
  };
}

export async function updateMyProfile(
  db: Db,
  actor: Actor,
  body: UpdateProfileBody,
  ctx: CommandContext,
): Promise<MyProfile> {
  const before = await db
    .selectFrom('identity.user_profiles')
    .select(['adult_confirmed_at', 'discoverable'])
    .where('id', '=', actor.profileId)
    .executeTakeFirstOrThrow();
  const now = new Date();
  const adultConfirmed = before.adult_confirmed_at !== null || body.adultConfirmed === true;
  if (body.discoverable === true && !adultConfirmed)
    throw new AppError(
      409,
      'CONFLICT',
      'Confirm you are 18 or over before switching Find me on',
      'Buddy search is for adults only',
    );
  await db.transaction().execute(async (trx) => {
    await trx
      .updateTable('identity.user_profiles')
      .set({
        ...(body.locality !== undefined ? { locality: body.locality || null } : {}),
        ...(body.bio !== undefined ? { bio: body.bio || null } : {}),
        ...(body.discoverable !== undefined ? { discoverable: body.discoverable } : {}),
        ...(body.showGear !== undefined ? { show_gear: body.showGear } : {}),
        ...(body.adultConfirmed && before.adult_confirmed_at === null
          ? { adult_confirmed_at: now }
          : {}),
        ...(body.onboarded === 'buddyclub' ? { buddyclub_onboarded_at: now } : {}),
        ...(body.onboarded === 'rally' ? { rally_onboarded_at: now } : {}),
      })
      .where('id', '=', actor.profileId)
      .execute();
    if (body.discoverable !== undefined && body.discoverable !== before.discoverable) {
      await recordAudit(trx, {
        entityType: 'user_profile',
        entityId: actor.profileId,
        operation: body.discoverable ? 'discoverable_on' : 'discoverable_off',
        actor: { type: 'user', id: actor.profileId },
        correlationId: ctx.correlationId,
        after: { discoverable: body.discoverable },
      });
    }
  });
  return getMyProfile(db, actor);
}

/**
 * Replaces the activity set. Every entry names a catalogue activity; its level must be on that
 * activity's ladder; `other` carries the typed name. An entry sent with just its id keeps what
 * it had.
 */
export async function setMyActivities(
  db: Db,
  actor: Actor,
  body: SetActivitiesBody,
): Promise<MyProfile> {
  // What is stored now: a level re-sent unchanged is accepted even if the ladder has since
  // moved (a catalogue edit must never lock a person out of saving their profile).
  const storedLevel = new Map<string, string | null>();
  for (const row of await db
    .selectFrom('identity.profile_activities')
    .select(['sport_id', 'custom_name', 'level'])
    .where('profile_id', '=', actor.profileId)
    .execute())
    storedLevel.set(
      row.sport_id === 'other'
        ? `other:${normaliseName(row.custom_name ?? '')}`
        : (row.sport_id ?? ''),
      row.level,
    );
  const wanted = new Map<string, SetActivitiesBody['activities'][number]>();
  for (const a of body.activities) {
    const activity = activityById(a.activityId);
    if (!activity)
      throw new AppError(400, 'VALIDATION_FAILED', `Unknown activity ${a.activityId}`, undefined, [
        { path: 'body/activities/activityId', message: 'not in the catalogue' },
      ]);
    if (a.activityId === 'other' && !a.customName)
      throw new AppError(400, 'VALIDATION_FAILED', 'Say what the activity is', undefined, [
        { path: 'body/activities/customName', message: 'required for other' },
      ]);
    const key =
      a.activityId === 'other' ? `other:${normaliseName(a.customName ?? '')}` : a.activityId;
    const unchanged = a.level !== undefined && (a.level || null) === storedLevel.get(key);
    if (a.level !== undefined && !unchanged && !isValidLevel(a.activityId, a.level))
      throw new AppError(
        400,
        'VALIDATION_FAILED',
        `${a.level} is not a level for ${activity.name}`,
        undefined,
        [{ path: 'body/activities/level', message: "must be on the activity's ladder" }],
      );
    // Several "other" entries may coexist, one per typed name.
    wanted.set(key, a);
  }

  await db.transaction().execute(async (trx) => {
    const existing = await trx
      .selectFrom('identity.profile_activities')
      .select(['id', 'sport_id', 'custom_name'])
      .where('profile_id', '=', actor.profileId)
      .execute();
    const keep = new Set<string>();
    for (const row of existing) {
      const key =
        row.sport_id === 'other'
          ? `other:${normaliseName(row.custom_name ?? '')}`
          : (row.sport_id ?? '');
      const next = wanted.get(key);
      if (!next) {
        await trx.deleteFrom('identity.profile_activities').where('id', '=', row.id).execute();
        continue;
      }
      keep.add(key);
      const patch = {
        ...(next.level !== undefined ? { level: next.level || null } : {}),
        ...(next.days !== undefined ? { days: JSON.stringify(next.days) } : {}),
        ...(next.note !== undefined ? { note: next.note } : {}),
      };
      if (Object.keys(patch).length)
        await trx
          .updateTable('identity.profile_activities')
          .set(patch)
          .where('id', '=', row.id)
          .execute();
    }
    const fresh = [...wanted.entries()].filter(([key]) => !keep.has(key));
    if (fresh.length)
      await trx
        .insertInto('identity.profile_activities')
        .values(
          fresh.map(([, a]) => ({
            profile_id: actor.profileId,
            interest_id: activityById(a.activityId)!.category,
            sport_id: a.activityId,
            level: a.level || null,
            days: JSON.stringify(a.days ?? {}),
            note: a.note ?? null,
            custom_name: a.activityId === 'other' ? (a.customName ?? null) : null,
          })),
        )
        .execute();
  });
  return getMyProfile(db, actor);
}

/** Replaces the gear list, in the order given. Each item names a catalogue activity. */
export async function setMyGear(db: Db, actor: Actor, body: SetGearBody): Promise<MyProfile> {
  for (const g of body.items)
    if (!activityById(g.activityId))
      throw new AppError(400, 'VALIDATION_FAILED', `Unknown activity ${g.activityId}`);
  await db.transaction().execute(async (trx) => {
    await trx
      .deleteFrom('identity.profile_gear')
      .where('profile_id', '=', actor.profileId)
      .execute();
    if (body.items.length)
      await trx
        .insertInto('identity.profile_gear')
        .values(
          body.items.map((g, i) => ({
            profile_id: actor.profileId,
            interest_id: activityById(g.activityId)!.category,
            sport_id: g.activityId,
            name: g.name,
            detail: g.detail ?? null,
            sort_order: i,
          })),
        )
        .execute();
  });
  return getMyProfile(db, actor);
}

/** How many people have asked for a typed name (open suggestions only). */
export async function suggestionCount(db: DbOrTrx, name: string): Promise<number> {
  const key = normaliseName(name);
  if (!key) return 0;
  const row = await db
    .selectFrom('identity.activity_suggestions')
    .select((eb) => eb.fn.count<string>('profile_id').distinct().as('n'))
    .where('key', '=', key)
    .where('promoted_to', 'is', null)
    .executeTakeFirst();
  return Number(row?.n ?? 0);
}

/**
 * "Not seeing yours?": a typed name. A catalogue hit is returned for the caller to add; a miss
 * is stored as a suggestion and goes on the profile as `other` under that name, so the person
 * is never blocked and the count keeps its meaning. Suggestions stay out of search and off
 * public profiles until promoted (the seed script does that).
 */
export async function suggestActivity(
  db: Db,
  actor: Actor,
  name: string,
): Promise<SuggestionResult> {
  const matched = matchActivity(name);
  if (matched && matched.id !== 'other')
    return { matched: { id: matched.id, name: matched.name }, count: 0, suggested: null };
  const key = normaliseName(name);
  if (!key) throw new AppError(400, 'VALIDATION_FAILED', 'Say what the activity is');
  await db.transaction().execute(async (trx) => {
    await trx
      .insertInto('identity.activity_suggestions')
      .values({ profile_id: actor.profileId, name, key })
      .onConflict((oc) => oc.columns(['profile_id', 'key']).doNothing())
      .execute();
    const have = await trx
      .selectFrom('identity.profile_activities')
      .select('id')
      .where('profile_id', '=', actor.profileId)
      .where('sport_id', '=', 'other')
      .where(sql`lower(custom_name)`, '=', key)
      .executeTakeFirst();
    if (!have)
      await trx
        .insertInto('identity.profile_activities')
        .values({
          profile_id: actor.profileId,
          interest_id: 'other',
          sport_id: 'other',
          level: null,
          days: '{}',
          note: null,
          custom_name: name,
        })
        .execute();
  });
  return { matched: null, count: await suggestionCount(db, name), suggested: name };
}
