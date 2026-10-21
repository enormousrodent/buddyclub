import type {
  GearItem,
  MyProfile,
  ProfileActivity,
  SetActivitiesBody,
  SetGearBody,
  UpdateProfileBody,
} from '@buddyclub/shared-types';
import type { Db } from '../../db/index.js';
import type { Actor } from '../../platform/actor.js';
import { recordAudit } from '../../platform/audit.js';
import { toIso } from '../../platform/tokens.js';
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
    ])
    .where('a.profile_id', '=', profileId)
    .orderBy('i.sort_order')
    .orderBy('s.name')
    .execute();
  return rows.map((r) => ({
    id: r.id,
    interestId: r.interest_id,
    interestName: r.interest_name,
    sportId: r.sport_id,
    sportName: r.sport_name ?? null,
    level: (r.level as ProfileActivity['level']) ?? null,
    days: (r.days as ProfileActivity['days']) ?? {},
    note: r.note,
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
    interestId: r.interest_id,
    sportId: r.sport_id,
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

/** Replaces the activity set. Unknown interests or sports are a 400. */
export async function setMyActivities(
  db: Db,
  actor: Actor,
  body: SetActivitiesBody,
): Promise<MyProfile> {
  const wanted = new Map<string, SetActivitiesBody['activities'][number]>();
  for (const a of body.activities) {
    const sportId = a.sportId ?? null;
    wanted.set(`${a.interestId}:${sportId ?? ''}`, { ...a, sportId });
  }
  const interestIds = [...new Set([...wanted.values()].map((a) => a.interestId))];
  const sportIds = [
    ...new Set([...wanted.values()].map((a) => a.sportId).filter((s): s is string => !!s)),
  ];
  const [interests, sports] = await Promise.all([
    interestIds.length
      ? db.selectFrom('community.interests').select('id').where('id', 'in', interestIds).execute()
      : Promise.resolve([]),
    sportIds.length
      ? db.selectFrom('community.sports').select('id').where('id', 'in', sportIds).execute()
      : Promise.resolve([]),
  ]);
  if (interests.length !== interestIds.length)
    throw new AppError(400, 'VALIDATION_FAILED', 'Unknown interest');
  if (sports.length !== sportIds.length)
    throw new AppError(400, 'VALIDATION_FAILED', 'Unknown sport');

  await db.transaction().execute(async (trx) => {
    const existing = await trx
      .selectFrom('identity.profile_activities')
      .select(['id', 'interest_id', 'sport_id'])
      .where('profile_id', '=', actor.profileId)
      .execute();
    const keep = new Set<string>();
    for (const row of existing) {
      const key = `${row.interest_id}:${row.sport_id ?? ''}`;
      const next = wanted.get(key);
      if (!next) {
        await trx.deleteFrom('identity.profile_activities').where('id', '=', row.id).execute();
        continue;
      }
      keep.add(key);
      // Only the fields sent change; an entry with just its ids keeps what it had.
      const patch = {
        ...(next.level !== undefined ? { level: next.level } : {}),
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
            interest_id: a.interestId,
            sport_id: a.sportId ?? null,
            level: a.level ?? null,
            days: JSON.stringify(a.days ?? {}),
            note: a.note ?? null,
          })),
        )
        .execute();
  });
  return getMyProfile(db, actor);
}

/** Replaces the gear list, in the order given. */
export async function setMyGear(db: Db, actor: Actor, body: SetGearBody): Promise<MyProfile> {
  const interestIds = [...new Set(body.items.map((g) => g.interestId))];
  if (interestIds.length) {
    const found = await db
      .selectFrom('community.interests')
      .select('id')
      .where('id', 'in', interestIds)
      .execute();
    if (found.length !== interestIds.length)
      throw new AppError(400, 'VALIDATION_FAILED', 'Unknown interest');
  }
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
            interest_id: g.interestId,
            sport_id: g.sportId ?? null,
            name: g.name,
            detail: g.detail ?? null,
            sort_order: i,
          })),
        )
        .execute();
  });
  return getMyProfile(db, actor);
}
