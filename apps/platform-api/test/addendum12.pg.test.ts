import { randomUUID } from 'node:crypto';
import {
  BoardSchema,
  KeepApartPairSchema,
  RatingSummarySchema,
  RoundSchema,
  RotationPreviewSchema,
} from '@buddyclub/shared-types';
import type { FastifyInstance, InjectOptions } from 'fastify';
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb, pingDb, type Db } from '../src/db/index.js';
import { PgIdentityRepository } from '../src/modules/identity/pg-repository.js';
import { PgIdempotencyStore } from '../src/plugins/idempotency.js';
import { bearer, createTestApp } from './helpers.js';

const databaseUrl = process.env['TEST_DATABASE_URL'];

/**
 * Addendum 1.2 steps 2 to 4: keep-apart defaults copied onto nights, the self check-in window,
 * anonymous night ratings, and king of the court from recorded results.
 */
describe.skipIf(!databaseUrl)(
  'Sessions: keep-apart, check-in window, ratings, king of the court',
  () => {
    const run = randomUUID().slice(0, 8);
    const users = { owner: randomUUID(), p1: randomUUID(), p2: randomUUID(), p3: randomUUID() };
    let db: Db;
    let app: FastifyInstance;
    let orgId = '';
    let groupId = '';
    let seriesId = '';
    let nextAt = '';
    let laterNightId = '';
    let nightId = '';
    const participants: Record<string, string> = {};
    const guests: string[] = [];

    const call = (opts: InjectOptions) => app.inject(opts);
    const json = (res: { statusCode: number; body: string }) => JSON.parse(res.body);
    const post = async (url: string, user: string, payload: unknown = {}) =>
      call({ method: 'POST', url, headers: await bearer(user), payload: payload as object });
    const put = async (url: string, user: string, payload: unknown = {}) =>
      call({ method: 'PUT', url, headers: await bearer(user), payload: payload as object });
    const patch = async (url: string, user: string, payload: unknown = {}) =>
      call({ method: 'PATCH', url, headers: await bearer(user), payload: payload as object });
    const get = async (url: string, user: string) =>
      call({ method: 'GET', url, headers: await bearer(user) });

    beforeAll(async () => {
      db = createDb({ connectionString: databaseUrl as string, maxConnections: 3 });
      await pingDb(db);
      for (const [name, id] of Object.entries(users)) {
        await sql`
        insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
        values (${id}::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
                ${`a12-${name}-${run}@example.com`}, '{}'::jsonb, ${JSON.stringify({ full_name: `A12 ${name}` })}::jsonb, now(), now())
      `.execute(db);
      }
      app = (
        await createTestApp({
          repo: new PgIdentityRepository(db),
          db,
          idempotencyStore: new PgIdempotencyStore(db),
        })
      ).app;

      const group = await post('/v1/community/groups', users.owner, {
        name: `Saturday Pickleball ${run}`,
        interestIds: ['sports'],
        sportId: 'pickleball',
      });
      expect(group.statusCode, group.body).toBe(201);
      groupId = json(group).id;
      orgId = json(group).organisationId;
      for (const u of [users.p1, users.p2, users.p3])
        expect((await post(`/v1/community/groups/${groupId}/join`, u)).statusCode).toBe(200);
      for (const [name, id] of Object.entries(users)) {
        const me = json(await get('/v1/me', id));
        participants[name] = me.participants.find(
          (p: { organisationId: string }) => p.organisationId === orgId,
        ).id;
      }
      const venue = json(
        await post(`/v1/organisations/${orgId}/venues`, users.owner, {
          name: 'Leisure centre',
          timezone: 'Europe/London',
        }),
      );
      await post(`/v1/venues/${venue.id}/courts`, users.owner, { code: '1' });
      const series = await post(`/v1/organisations/${orgId}/sessions`, users.owner, {
        name: 'Saturday Pickleball',
        sportId: 'pickleball',
        venueId: venue.id,
        schedule: { weekday: 6, time: '12:00', timezone: 'Europe/London' },
        defaultRoundMinutes: 10,
      });
      expect(series.statusCode, series.body).toBe(201);
      seriesId = json(series).id;
      nextAt = json(series).nextAt;
      await put(`/v1/sessions/${seriesId}/regulars`, users.owner, {
        participantIds: [participants['p1'], participants['p2'], participants['p3']],
      });
    }, 180_000);

    afterAll(async () => {
      await app?.close();
      if (!db) return;
      if (orgId) {
        // Results are append-only; the cascade from the series needs the guard off, as in phase 3.
        await sql`alter table matches.result_revisions disable trigger result_revisions_append_only`.execute(
          db,
        );
        try {
          await db
            .deleteFrom('activities.session_series')
            .where('organisation_id', '=', orgId)
            .execute();
          await db.deleteFrom('community.organisations').where('id', '=', orgId).execute();
        } finally {
          await sql`alter table matches.result_revisions enable trigger result_revisions_append_only`.execute(
            db,
          );
        }
      }
      const rows = await db
        .selectFrom('identity.user_profiles')
        .select('id')
        .where('auth_user_id', 'in', Object.values(users))
        .execute();
      const ids = rows.map((p) => p.id);
      if (ids.length) {
        await db
          .deleteFrom('platform.idempotency_keys')
          .where(
            'scope',
            'in',
            ids.map((id) => `user:${id}`),
          )
          .execute();
        await db.deleteFrom('identity.user_profiles').where('id', 'in', ids).execute();
      }
      await sql`delete from auth.users where id = any(${Object.values(users)}::uuid[])`.execute(db);
      await db.destroy();
    }, 120_000);

    it('keeps a pair apart on the session and copies it onto a night as an avoid lock', async () => {
      const stranger = await put(`/v1/sessions/${seriesId}/keep-apart`, users.owner, {
        pairs: [{ participantA: participants['p1'], participantB: randomUUID() }],
      });
      expect(stranger.statusCode).toBe(400);
      const notAllowed = await put(`/v1/sessions/${seriesId}/keep-apart`, users.p1, {
        pairs: [{ participantA: participants['p1'], participantB: participants['p2'] }],
      });
      expect(notAllowed.statusCode).toBe(403);
      const saved = await put(`/v1/sessions/${seriesId}/keep-apart`, users.owner, {
        pairs: [
          { participantA: participants['p1'], participantB: participants['p2'] },
          // Duplicate in the other order collapses to one pair.
          { participantA: participants['p2'], participantB: participants['p1'] },
        ],
      });
      expect(saved.statusCode, saved.body).toBe(200);
      const pairs = json(saved).items.map((p: unknown) => KeepApartPairSchema.parse(p));
      expect(pairs).toHaveLength(1);

      // Set up a later night: regulars registered, the avoid lock copied.
      const setUp = await post(`/v1/sessions/${seriesId}/start`, users.owner, { startsAt: nextAt });
      expect(setUp.statusCode, setUp.body).toBe(201);
      laterNightId = json(setUp).id;
      const locks = json(
        await get(`/v1/occurrences/${laterNightId}/pair-locks`, users.owner),
      ).items;
      expect(locks).toHaveLength(1);
      expect(locks[0]).toMatchObject({ kind: 'avoid' });
      expect([locks[0].participantA, locks[0].participantB].sort()).toEqual(
        [participants['p1'], participants['p2']].sort(),
      );
    });

    it('attendees cannot check themselves in before the window; hosts can check anyone in', async () => {
      const early = await post(`/v1/occurrences/${laterNightId}/check-ins`, users.p1, {});
      expect(early.statusCode).toBe(409);
      expect(json(early).detail).toMatch(/opens at/);
      const board = BoardSchema.parse(
        json(await get(`/v1/occurrences/${laterNightId}/board`, users.p1)),
      );
      expect(new Date(board.occurrence.checkInOpensAt).getTime()).toBe(
        new Date(nextAt).getTime() - 10 * 60_000,
      );
      const byOwner = await post(`/v1/occurrences/${laterNightId}/check-ins`, users.owner, {
        participantId: participants['p1'],
      });
      expect(byOwner.statusCode, byOwner.body).toBe(200);
      expect((await post(`/v1/occurrences/${laterNightId}/cancel`, users.owner)).statusCode).toBe(
        200,
      );
    });

    it('runs a king of the court night: round 1 mixes, round 2 moves by the recorded result', async () => {
      const started = await post(`/v1/sessions/${seriesId}/start`, users.owner, {
        mode: 'king_of_the_court',
        roundMinutes: 8,
      });
      expect(started.statusCode, started.body).toBe(201);
      nightId = json(started).id;
      expect(json(started).roundDurationSeconds).toBe(480);
      let board = BoardSchema.parse(
        json(await get(`/v1/occurrences/${nightId}/board`, users.owner)),
      );
      expect(board.occurrence.mode).toBe('king_of_the_court');

      // Started now, so the window is open: p1 checks in alone; the owner checks p2 and p3 in.
      expect((await post(`/v1/occurrences/${nightId}/check-ins`, users.p1, {})).statusCode).toBe(
        200,
      );
      for (const p of ['p2', 'p3'])
        await post(`/v1/occurrences/${nightId}/check-ins`, users.owner, {
          participantId: participants[p],
        });
      for (const name of ['Guest A', 'Guest B', 'Guest C'])
        guests.push(
          json(
            await post(`/v1/occurrences/${nightId}/participants`, users.owner, {
              displayName: name,
            }),
          ).participantId,
        );
      // The avoid lock arrived with p1 and p2.
      const locks = json(await get(`/v1/occurrences/${nightId}/pair-locks`, users.owner)).items;
      expect(locks.map((l: { kind: string }) => l.kind)).toEqual(['avoid']);

      const preview1 = RotationPreviewSchema.parse(
        json(await post(`/v1/occurrences/${nightId}/rotations/preview`, users.owner, {})),
      );
      expect(preview1.assignments).toHaveLength(1);
      expect(preview1.resting).toHaveLength(2);
      const commit1 = await post(`/v1/occurrences/${nightId}/rotations/commit`, users.owner, {
        previewId: preview1.previewId,
      });
      expect(commit1.statusCode, commit1.body).toBe(201);
      const round1 = RoundSchema.parse(json(commit1));
      const match = round1.assignments[0]!;
      expect(match.winnerSide).toBeNull();

      // The format is locked once a round exists.
      const locked = await patch(`/v1/occurrences/${nightId}`, users.owner, { mode: 'mix' });
      expect(locked.statusCode).toBe(409);
      // No result on a round that has not started.
      const tooEarly = await post(
        `/v1/occurrences/${nightId}/matches/${match.matchId}/result`,
        users.owner,
        { winnerSide: 2 },
      );
      expect(tooEarly.statusCode).toBe(409);

      expect((await post(`/v1/rounds/${round1.id}/start`, users.owner)).statusCode).toBe(200);
      const recorded = await post(
        `/v1/occurrences/${nightId}/matches/${match.matchId}/result`,
        users.owner,
        { winnerSide: 2 },
      );
      expect(recorded.statusCode, recorded.body).toBe(200);
      expect(RoundSchema.parse(json(recorded)).assignments[0]!.winnerSide).toBe(2);
      const byPlayer = await post(
        `/v1/occurrences/${nightId}/matches/${match.matchId}/result`,
        users.p1,
        { winnerSide: 1 },
      );
      expect(byPlayer.statusCode).toBe(403);
      expect((await post(`/v1/rounds/${round1.id}/complete`, users.owner)).statusCode).toBe(200);

      const preview2 = RotationPreviewSchema.parse(
        json(await post(`/v1/occurrences/${nightId}/rotations/preview`, users.owner, {})),
      );
      const winners = match.teams[1]!.map((p) => p.participantId).sort();
      const losers = match.teams[0]!.map((p) => p.participantId).sort();
      const rested = preview1.resting.map((p) => p.participantId).sort();
      const court = preview2.assignments[0]!;
      expect(court.teams[0]!.map((p) => p.participantId).sort()).toEqual(winners);
      expect(court.teams[1]!.map((p) => p.participantId).sort()).toEqual(rested);
      expect(preview2.resting.map((p) => p.participantId).sort()).toEqual(losers);
      expect(preview2.algorithmVersion).toBe('king-of-the-court@1');

      board = BoardSchema.parse(json(await get(`/v1/occurrences/${nightId}/board`, users.owner)));
      expect(board.currentRound?.assignments[0]?.winnerSide).toBe(2);
      expect((await post(`/v1/occurrences/${nightId}/complete`, users.owner)).statusCode).toBe(200);
    });

    it('attendees rate the night once; the picture appears from three ratings; no one reads a single one', async () => {
      const first = await post(`/v1/occurrences/${nightId}/ratings`, users.p1, {
        score: 5,
        tags: ['good_mix', 'friendly'],
      });
      expect(first.statusCode, first.body).toBe(201);
      let summary = RatingSummarySchema.parse(json(first));
      expect(summary).toMatchObject({
        count: 1,
        average: null,
        tags: null,
        myRating: { score: 5, tags: ['good_mix', 'friendly'] },
        canRate: false,
      });
      expect(
        (await post(`/v1/occurrences/${nightId}/ratings`, users.p1, { score: 4 })).statusCode,
      ).toBe(409);
      // The owner ran it but was not on the roster.
      expect(
        (await post(`/v1/occurrences/${nightId}/ratings`, users.owner, { score: 5 })).statusCode,
      ).toBe(403);
      // Tags must match the side of the score.
      const mismatch = await post(`/v1/occurrences/${nightId}/ratings`, users.p2, {
        score: 1,
        tags: ['good_mix'],
      });
      expect(mismatch.statusCode).toBe(400);
      const asOwner = RatingSummarySchema.parse(
        json(await get(`/v1/occurrences/${nightId}/ratings/summary`, users.owner)),
      );
      expect(asOwner).toMatchObject({ count: 1, average: null, tags: null, myRating: null });

      const pendingBefore = json(await get('/v1/me/ratings/pending', users.p2)).items;
      expect(pendingBefore.map((p: { occurrenceId: string }) => p.occurrenceId)).toEqual([nightId]);
      expect(json(await get('/v1/me/ratings/pending', users.p1)).items).toEqual([]);

      expect(
        (
          await post(`/v1/occurrences/${nightId}/ratings`, users.p2, {
            score: 1,
            tags: ['started_late'],
          })
        ).statusCode,
      ).toBe(201);
      expect(
        (
          await post(`/v1/occurrences/${nightId}/ratings`, users.p3, {
            score: 4,
            tags: ['good_mix'],
          })
        ).statusCode,
      ).toBe(201);
      summary = RatingSummarySchema.parse(
        json(await get(`/v1/occurrences/${nightId}/ratings/summary`, users.owner)),
      );
      expect(summary).toMatchObject({
        count: 3,
        average: 3.3,
        tags: { good_mix: 2, friendly: 1, started_late: 1 },
        myRating: null,
        canRate: false,
      });
      const series = json(await get(`/v1/sessions/${seriesId}/ratings/summary`, users.owner));
      expect(series).toMatchObject({ count: 3, nights: 1, average: 3.3 });
      expect(json(await get('/v1/me/ratings/pending', users.p2)).items).toEqual([]);

      // Nothing anywhere returns a rating row with who gave it.
      const raw = await db
        .selectFrom('activities.session_ratings')
        .select((eb) => eb.fn.countAll<string>().as('n'))
        .where('occurrence_id', '=', nightId)
        .executeTakeFirst();
      expect(Number(raw?.n)).toBe(3);
    });
  },
);
