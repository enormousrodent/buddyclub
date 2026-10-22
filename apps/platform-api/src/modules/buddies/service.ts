import type {
  BuddyCard,
  BuddySearchQuery,
  BuddySummary,
  Hello,
  ReportBuddyBody,
} from '@buddyclub/shared-types';
import { sql } from 'kysely';
import type { Db } from '../../db/index.js';
import type { Actor } from '../../platform/actor.js';
import { recordAudit } from '../../platform/audit.js';
import { emitEvent } from '../../platform/outbox.js';
import { toIso, toIsoOrNull } from '../../platform/tokens.js';
import { AppError } from '../../problems.js';
import type { CommandContext } from '../organisations/service.js';

/**
 * Buddies (Addendum 1.4 steps 3 and 5). Every account is a Buddy Club member; a buddy is
 * someone you have shared a night with (both checked in on the same occurrence), derived here
 * from session entries rather than stored. Find me adds people you have not played with, for
 * adults who switched it on, and only to members who are findable themselves. A block hides
 * both people from each other and is never disclosed. Reports land in the audit trail and in
 * `identity.buddy_reports` for a person to review.
 */

const SEARCH_LIMIT = 50;

interface SharedRow {
  profile_id: string;
  display_name: string;
  avatar_url: string | null;
  locality: string | null;
  shared: string;
  last_played: Date | string | null;
}

/** Everyone the actor has shared a night with, excluding blocks in either direction. */
async function sharedNights(db: Db, me: string, only?: string): Promise<SharedRow[]> {
  const result = await sql<SharedRow>`
    with mine as (
      select distinct e.occurrence_id
      from activities.session_entries e
      join identity.participants p on p.id = e.participant_id
      where p.user_profile_id = ${me}::uuid and e.check_in_at is not null
    )
    select u.id as profile_id, u.display_name, u.avatar_url, u.locality,
           count(distinct e.occurrence_id)::text as shared, max(o.starts_at) as last_played
    from mine
    join activities.session_entries e on e.occurrence_id = mine.occurrence_id and e.check_in_at is not null
    join identity.participants p on p.id = e.participant_id
    join identity.user_profiles u on u.id = p.user_profile_id
    join activities.session_occurrences o on o.id = e.occurrence_id
    where u.id <> ${me}::uuid
      and u.anonymised_at is null
      and (${only ?? null}::uuid is null or u.id = ${only ?? null}::uuid)
      and not exists (
        select 1 from identity.buddy_blocks b
        where (b.blocker_id = ${me}::uuid and b.blocked_id = u.id)
           or (b.blocker_id = u.id and b.blocked_id = ${me}::uuid)
      )
    group by u.id, u.display_name, u.avatar_url, u.locality
    order by max(o.starts_at) desc, u.display_name
  `.execute(db);
  return result.rows;
}

async function sportsFor(
  db: Db,
  profileIds: string[],
): Promise<Map<string, BuddySummary['sports']>> {
  const out = new Map<string, BuddySummary['sports']>();
  if (!profileIds.length) return out;
  const rows = await db
    .selectFrom('identity.profile_activities as a')
    .innerJoin('community.sports as s', 's.id', 'a.sport_id')
    .innerJoin('community.interests as i', 'i.id', 'a.interest_id')
    .select(['a.profile_id', 'a.sport_id', 's.name', 'a.level'])
    .where('a.profile_id', 'in', profileIds)
    .where('a.sport_id', '<>', 'other')
    .orderBy('i.sort_order')
    .orderBy('s.name')
    .execute();
  for (const r of rows) {
    const list = out.get(r.profile_id) ?? [];
    list.push({ activityId: r.sport_id as string, activityName: r.name, level: r.level });
    out.set(r.profile_id, list);
  }
  return out;
}

async function hellosFor(
  db: Db,
  me: string,
  profileIds: string[],
): Promise<Map<string, { sent: boolean; received: boolean }>> {
  const out = new Map<string, { sent: boolean; received: boolean }>();
  if (!profileIds.length) return out;
  const rows = await db
    .selectFrom('identity.buddy_hellos')
    .select(['from_id', 'to_id'])
    .where((eb) =>
      eb.or([
        eb.and([eb('from_id', '=', me), eb('to_id', 'in', profileIds)]),
        eb.and([eb('to_id', '=', me), eb('from_id', 'in', profileIds)]),
      ]),
    )
    .execute();
  for (const r of rows) {
    const other = r.from_id === me ? r.to_id : r.from_id;
    const cur = out.get(other) ?? { sent: false, received: false };
    if (r.from_id === me) cur.sent = true;
    else cur.received = true;
    out.set(other, cur);
  }
  return out;
}

async function blockedEitherWay(db: Db, me: string, other: string): Promise<boolean> {
  const row = await db
    .selectFrom('identity.buddy_blocks')
    .select('blocker_id')
    .where((eb) =>
      eb.or([
        eb.and([eb('blocker_id', '=', me), eb('blocked_id', '=', other)]),
        eb.and([eb('blocker_id', '=', other), eb('blocked_id', '=', me)]),
      ]),
    )
    .executeTakeFirst();
  return row !== undefined;
}

export async function listMyBuddies(db: Db, actor: Actor): Promise<BuddySummary[]> {
  const rows = await sharedNights(db, actor.profileId);
  const ids = rows.map((r) => r.profile_id);
  const [sports, hellos] = await Promise.all([
    sportsFor(db, ids),
    hellosFor(db, actor.profileId, ids),
  ]);
  return rows.map((r) => ({
    profileId: r.profile_id,
    displayName: r.display_name,
    avatarUrl: r.avatar_url,
    locality: r.locality,
    sports: sports.get(r.profile_id) ?? [],
    sharedNights: Number(r.shared),
    lastPlayedAt: toIsoOrNull(r.last_played),
    hello: hellos.get(r.profile_id) ?? { sent: false, received: false },
  }));
}

/**
 * Find me. The caller must be findable themselves (which already means 18+), so looking and
 * being looked at go together. Results are adults with Find me on, never the caller, never a
 * block in either direction.
 */
export async function searchBuddies(
  db: Db,
  actor: Actor,
  q: BuddySearchQuery,
): Promise<BuddySummary[]> {
  const me = await db
    .selectFrom('identity.user_profiles')
    .select(['discoverable', 'adult_confirmed_at'])
    .where('id', '=', actor.profileId)
    .executeTakeFirstOrThrow();
  if (!me.discoverable || me.adult_confirmed_at === null)
    throw new AppError(
      409,
      'CONFLICT',
      'Switch Find me on to look for people',
      'Finding people and being found go together, and both are for adults',
    );

  let query = db
    .selectFrom('identity.user_profiles as u')
    .select(['u.id', 'u.display_name', 'u.avatar_url', 'u.locality'])
    .where('u.discoverable', '=', true)
    .where('u.adult_confirmed_at', 'is not', null)
    .where('u.anonymised_at', 'is', null)
    .where('u.id', '<>', actor.profileId)
    .where(({ not, exists, selectFrom }) =>
      not(
        exists(
          selectFrom('identity.buddy_blocks as b')
            .select('b.blocker_id')
            .where((eb) =>
              eb.or([
                eb.and([
                  eb('b.blocker_id', '=', actor.profileId),
                  eb('b.blocked_id', '=', eb.ref('u.id')),
                ]),
                eb.and([
                  eb('b.blocker_id', '=', eb.ref('u.id')),
                  eb('b.blocked_id', '=', actor.profileId),
                ]),
              ]),
            ),
        ),
      ),
    )
    .orderBy('u.display_name')
    .limit(SEARCH_LIMIT);
  if (q.locality) query = query.where('u.locality', 'ilike', `%${q.locality}%`);
  if (q.sport) {
    const sport = q.sport;
    query = query.where(({ exists, selectFrom }) =>
      exists(
        selectFrom('identity.profile_activities as a')
          .select('a.id')
          .where((eb) => eb('a.profile_id', '=', eb.ref('u.id')))
          .where('a.sport_id', '=', sport)
          .$if(Boolean(q.level), (qb) => qb.where('a.level', '=', q.level as string))
          .$if(Boolean(q.day), (qb) =>
            qb.where(
              q.slot
                ? sql<boolean>`a.days -> ${q.day} ? ${q.slot}`
                : sql<boolean>`jsonb_array_length(coalesce(a.days -> ${q.day}, '[]'::jsonb)) > 0`,
            ),
          ),
      ),
    );
  }
  const rows = await query.execute();
  const ids = rows.map((r) => r.id);
  const [sports, hellos, shared] = await Promise.all([
    sportsFor(db, ids),
    hellosFor(db, actor.profileId, ids),
    sharedNights(db, actor.profileId),
  ]);
  const sharedById = new Map(shared.map((s) => [s.profile_id, s]));
  return rows.map((r) => {
    const s = sharedById.get(r.id);
    return {
      profileId: r.id,
      displayName: r.display_name,
      avatarUrl: r.avatar_url,
      locality: r.locality,
      sports: sports.get(r.id) ?? [],
      sharedNights: s ? Number(s.shared) : 0,
      lastPlayedAt: s ? toIsoOrNull(s.last_played) : null,
      hello: hellos.get(r.id) ?? { sent: false, received: false },
    };
  });
}

/**
 * A member's card, for someone allowed to see it: a buddy (shared night) or an adult with Find
 * me on. Level, days, bio and place are member-to-member; gear only when they show it. A block
 * in either direction reads as not found.
 */
export async function getBuddyCard(db: Db, actor: Actor, profileId: string): Promise<BuddyCard> {
  if (profileId === actor.profileId)
    throw new AppError(404, 'NOT_FOUND', 'That is you; see your own profile');
  const person = await db
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
      'anonymised_at',
    ])
    .where('id', '=', profileId)
    .executeTakeFirst();
  if (!person || person.anonymised_at !== null)
    throw new AppError(404, 'NOT_FOUND', 'No such person');
  const [shared] = await sharedNights(db, actor.profileId, profileId);
  const findable = person.discoverable && person.adult_confirmed_at !== null;
  const iBlocked = await db
    .selectFrom('identity.buddy_blocks')
    .select('blocked_id')
    .where('blocker_id', '=', actor.profileId)
    .where('blocked_id', '=', profileId)
    .executeTakeFirst();
  if (!shared && !iBlocked) {
    // Not a buddy: only findable people are visible, and never across a block.
    if (!findable || (await blockedEitherWay(db, actor.profileId, profileId)))
      throw new AppError(404, 'NOT_FOUND', 'No such person');
  }

  const [activities, gear, hellos] = await Promise.all([
    db
      .selectFrom('identity.profile_activities as a')
      .innerJoin('community.sports as s', 's.id', 'a.sport_id')
      .innerJoin('community.interests as i', 'i.id', 'a.interest_id')
      .select(['a.sport_id', 's.name', 'a.interest_id', 'a.level', 'a.days', 'a.note'])
      .where('a.profile_id', '=', profileId)
      .where('a.sport_id', '<>', 'other')
      .orderBy('i.sort_order')
      .orderBy('s.name')
      .execute(),
    person.show_gear
      ? db
          .selectFrom('identity.profile_gear')
          .select(['sport_id', 'interest_id', 'name', 'detail'])
          .where('profile_id', '=', profileId)
          .orderBy('sort_order')
          .execute()
      : Promise.resolve(null),
    hellosFor(db, actor.profileId, [profileId]),
  ]);
  return {
    profileId: person.id,
    displayName: person.display_name,
    avatarUrl: person.avatar_url,
    locality: person.locality,
    bio: person.bio,
    sports: activities.map((a) => ({
      activityId: a.sport_id as string,
      activityName: a.name,
      level: a.level,
    })),
    activities: activities.map((a) => ({
      activityId: a.sport_id as string,
      activityName: a.name,
      interestId: a.interest_id,
      level: a.level,
      days: (a.days as BuddyCard['activities'][number]['days']) ?? {},
      note: a.note,
    })),
    gear: gear
      ? gear.map((g) => ({
          activityId: g.sport_id ?? g.interest_id,
          name: g.name,
          detail: g.detail,
        }))
      : null,
    sharedNights: shared ? Number(shared.shared) : 0,
    lastPlayedAt: shared ? toIsoOrNull(shared.last_played) : null,
    hello: hellos.get(profileId) ?? { sent: false, received: false },
    relationship: shared ? 'buddy' : 'found',
    blocked: iBlocked !== undefined,
  };
}

/** Say hi: once per pair and direction; saying it again changes nothing. */
export async function sayHello(
  db: Db,
  actor: Actor,
  profileId: string,
  ctx: CommandContext,
): Promise<BuddyCard> {
  const card = await getBuddyCard(db, actor, profileId);
  if (card.blocked) throw new AppError(409, 'CONFLICT', 'Unblock them first');
  await db.transaction().execute(async (trx) => {
    const inserted = await trx
      .insertInto('identity.buddy_hellos')
      .values({ from_id: actor.profileId, to_id: profileId })
      .onConflict((oc) => oc.columns(['from_id', 'to_id']).doNothing())
      .returning('id')
      .executeTakeFirst();
    if (!inserted) return;
    await recordAudit(trx, {
      entityType: 'user_profile',
      entityId: profileId,
      operation: 'hello',
      actor: { type: 'user', id: actor.profileId },
      correlationId: ctx.correlationId,
    });
    await emitEvent(trx, {
      eventType: 'buddies.hello',
      aggregateType: 'user_profile',
      aggregateId: profileId,
      payload: { from: actor.profileId, to: profileId },
      dedupeKey: `hello:${actor.profileId}:${profileId}`,
    });
  });
  return getBuddyCard(db, actor, profileId);
}

/** People who said hi to you, newest first; reading the list marks them seen. */
export async function listMyHellos(db: Db, actor: Actor): Promise<Hello[]> {
  const rows = await db
    .selectFrom('identity.buddy_hellos as h')
    .innerJoin('identity.user_profiles as u', 'u.id', 'h.from_id')
    .select(['h.id', 'h.from_id', 'u.display_name', 'u.avatar_url', 'h.created_at', 'h.seen_at'])
    .where('h.to_id', '=', actor.profileId)
    .where('u.anonymised_at', 'is', null)
    .where(({ not, exists, selectFrom }) =>
      not(
        exists(
          selectFrom('identity.buddy_blocks as b')
            .select('b.blocker_id')
            .where((eb) =>
              eb.or([
                eb.and([
                  eb('b.blocker_id', '=', actor.profileId),
                  eb('b.blocked_id', '=', eb.ref('h.from_id')),
                ]),
                eb.and([
                  eb('b.blocker_id', '=', eb.ref('h.from_id')),
                  eb('b.blocked_id', '=', actor.profileId),
                ]),
              ]),
            ),
        ),
      ),
    )
    .orderBy('h.created_at', 'desc')
    .limit(50)
    .execute();
  const shared = new Map(
    (await sharedNights(db, actor.profileId)).map((s) => [s.profile_id, Number(s.shared)]),
  );
  const unseen = rows.filter((r) => r.seen_at === null).map((r) => r.id);
  if (unseen.length)
    await db
      .updateTable('identity.buddy_hellos')
      .set({ seen_at: new Date() })
      .where('id', 'in', unseen)
      .execute();
  return rows.map((r) => ({
    id: r.id,
    from: { profileId: r.from_id, displayName: r.display_name, avatarUrl: r.avatar_url },
    sharedNights: shared.get(r.from_id) ?? 0,
    createdAt: toIso(r.created_at),
    seenAt: toIsoOrNull(r.seen_at),
  }));
}

/** Block: they vanish from your lists and you from theirs. Nothing tells them. */
export async function blockBuddy(
  db: Db,
  actor: Actor,
  profileId: string,
  ctx: CommandContext,
): Promise<BuddyCard> {
  if (profileId === actor.profileId) throw new AppError(400, 'VALIDATION_FAILED', 'That is you');
  const exists = await db
    .selectFrom('identity.user_profiles')
    .select('id')
    .where('id', '=', profileId)
    .executeTakeFirst();
  if (!exists) throw new AppError(404, 'NOT_FOUND', 'No such person');
  await db.transaction().execute(async (trx) => {
    const inserted = await trx
      .insertInto('identity.buddy_blocks')
      .values({ blocker_id: actor.profileId, blocked_id: profileId })
      .onConflict((oc) => oc.doNothing())
      .returning('blocked_id')
      .executeTakeFirst();
    if (inserted)
      await recordAudit(trx, {
        entityType: 'user_profile',
        entityId: profileId,
        operation: 'blocked',
        actor: { type: 'user', id: actor.profileId },
        correlationId: ctx.correlationId,
      });
  });
  return getBuddyCard(db, actor, profileId);
}

export async function unblockBuddy(
  db: Db,
  actor: Actor,
  profileId: string,
  ctx: CommandContext,
): Promise<BuddyCard> {
  await db.transaction().execute(async (trx) => {
    const removed = await trx
      .deleteFrom('identity.buddy_blocks')
      .where('blocker_id', '=', actor.profileId)
      .where('blocked_id', '=', profileId)
      .returning('blocked_id')
      .executeTakeFirst();
    if (removed)
      await recordAudit(trx, {
        entityType: 'user_profile',
        entityId: profileId,
        operation: 'unblocked',
        actor: { type: 'user', id: actor.profileId },
        correlationId: ctx.correlationId,
      });
  });
  return getBuddyCard(db, actor, profileId);
}

/** Report: stored for review and written to the audit trail. The reported person is not told. */
export async function reportBuddy(
  db: Db,
  actor: Actor,
  profileId: string,
  body: ReportBuddyBody,
  ctx: CommandContext,
): Promise<void> {
  if (profileId === actor.profileId) throw new AppError(400, 'VALIDATION_FAILED', 'That is you');
  const exists = await db
    .selectFrom('identity.user_profiles')
    .select('id')
    .where('id', '=', profileId)
    .executeTakeFirst();
  if (!exists) throw new AppError(404, 'NOT_FOUND', 'No such person');
  await db.transaction().execute(async (trx) => {
    await trx
      .insertInto('identity.buddy_reports')
      .values({ reporter_id: actor.profileId, reported_id: profileId, reason: body.reason })
      .execute();
    await recordAudit(trx, {
      entityType: 'user_profile',
      entityId: profileId,
      operation: 'reported',
      actor: { type: 'user', id: actor.profileId },
      correlationId: ctx.correlationId,
      reason: body.reason,
    });
  });
}
