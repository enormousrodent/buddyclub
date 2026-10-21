import type { KeepApartPair } from '@buddyclub/shared-types';
import type { Db } from '../../db/index.js';
import type { Actor } from '../../platform/actor.js';
import { assertOrgAction } from '../../platform/authz.js';
import { AppError } from '../../problems.js';
import type { DbOrTrx } from './common.js';

/**
 * Keep-apart defaults (Addendum 1.2 step 2): pairs who should never share a court, kept on
 * the session and copied onto every night as `avoid` pair locks. Copying happens whenever a
 * night gains a player (set-up, walk-in, self check-in), and only once per pair per night.
 */

async function seriesOrg(db: DbOrTrx, seriesId: string): Promise<string> {
  const row = await db
    .selectFrom('activities.session_series')
    .select('organisation_id')
    .where('id', '=', seriesId)
    .executeTakeFirst();
  if (!row) throw new AppError(404, 'NOT_FOUND', 'Session not found');
  return row.organisation_id;
}

export async function loadKeepApart(db: DbOrTrx, seriesId: string): Promise<KeepApartPair[]> {
  const rows = await db
    .selectFrom('activities.session_keep_apart as k')
    .innerJoin('identity.participants as a', 'a.id', 'k.participant_a')
    .innerJoin('identity.participants as b', 'b.id', 'k.participant_b')
    .select([
      'k.participant_a',
      'k.participant_b',
      'a.display_name as name_a',
      'b.display_name as name_b',
    ])
    .where('k.series_id', '=', seriesId)
    .orderBy('a.display_name')
    .orderBy('b.display_name')
    .execute();
  return rows.map((r) => ({
    participantA: r.participant_a,
    participantB: r.participant_b,
    displayNameA: r.name_a,
    displayNameB: r.name_b,
  }));
}

export async function listKeepApart(
  db: Db,
  actor: Actor,
  seriesId: string,
): Promise<KeepApartPair[]> {
  const orgId = await seriesOrg(db, seriesId);
  assertOrgAction(actor, orgId, 'session.view');
  return loadKeepApart(db, seriesId);
}

/** Replaces the set. Both of each pair must be players in the series' organisation. */
export async function setKeepApart(
  db: Db,
  actor: Actor,
  seriesId: string,
  pairs: { participantA: string; participantB: string }[],
): Promise<KeepApartPair[]> {
  const orgId = await seriesOrg(db, seriesId);
  assertOrgAction(actor, orgId, 'session.manage');
  const normalised = new Map<string, [string, string]>();
  for (const p of pairs) {
    const [a, b] = [p.participantA, p.participantB].sort() as [string, string];
    normalised.set(`${a}:${b}`, [a, b]);
  }
  const ids = [...new Set([...normalised.values()].flat())];
  await db.transaction().execute(async (trx) => {
    if (ids.length) {
      const valid = await trx
        .selectFrom('identity.participants')
        .select('id')
        .where('organisation_id', '=', orgId)
        .where('id', 'in', ids)
        .where('archived_at', 'is', null)
        .execute();
      if (valid.length !== ids.length)
        throw new AppError(400, 'VALIDATION_FAILED', 'Everyone kept apart must be a player here');
    }
    await trx
      .deleteFrom('activities.session_keep_apart')
      .where('series_id', '=', seriesId)
      .execute();
    if (normalised.size)
      await trx
        .insertInto('activities.session_keep_apart')
        .values(
          [...normalised.values()].map(([participant_a, participant_b]) => ({
            series_id: seriesId,
            participant_a,
            participant_b,
            created_by_profile_id: actor.profileId,
          })),
        )
        .execute();
  });
  return loadKeepApart(db, seriesId);
}

/**
 * Copies the series' keep-apart pairs onto a night as `avoid` locks, for every pair whose two
 * players both have an active entry and that is not already locked. Returns how many were added.
 */
export async function applyKeepApart(
  db: DbOrTrx,
  seriesId: string,
  occurrenceId: string,
  createdByProfileId: string | null,
): Promise<number> {
  const pairs = await db
    .selectFrom('activities.session_keep_apart')
    .select(['participant_a', 'participant_b'])
    .where('series_id', '=', seriesId)
    .execute();
  if (!pairs.length) return 0;
  const [entries, locks] = await Promise.all([
    db
      .selectFrom('activities.session_entries')
      .select('participant_id')
      .where('occurrence_id', '=', occurrenceId)
      .where('attendance_status', 'in', ['registered', 'checked_in'])
      .execute(),
    db
      .selectFrom('activities.pair_locks')
      .select(['participant_a', 'participant_b'])
      .where('occurrence_id', '=', occurrenceId)
      .where('released_at', 'is', null)
      .execute(),
  ]);
  const present = new Set(entries.map((e) => e.participant_id));
  const locked = new Set(locks.map((l) => `${l.participant_a}:${l.participant_b}`));
  const missing = pairs.filter(
    (p) =>
      present.has(p.participant_a) &&
      present.has(p.participant_b) &&
      !locked.has(`${p.participant_a}:${p.participant_b}`),
  );
  if (!missing.length) return 0;
  await db
    .insertInto('activities.pair_locks')
    .values(
      missing.map((p) => ({
        occurrence_id: occurrenceId,
        participant_a: p.participant_a,
        participant_b: p.participant_b,
        kind: 'avoid' as const,
        created_by_profile_id: createdByProfileId,
      })),
    )
    .execute();
  return missing.length;
}
