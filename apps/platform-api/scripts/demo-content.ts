/* eslint-disable no-console */
/**
 * Demo content for trying the product: a club with venue, players, social sessions in every
 * state, a league meet mid-way and a pools-into-knockout tournament, all owned by YOUR account so
 * the screens show them with your real role.
 *
 *   pnpm --filter @buddyclub/platform-api demo -- --email you@example.com [--reset]
 *
 * Runs the API in-process against DATABASE_URL (apps/platform-api/.env) and drives it through the
 * same endpoints the web app uses, so everything is audited and rule-checked like real use.
 * `--reset` deletes the demo club first. Never run against a shared or production project.
 */
import { randomUUID } from 'node:crypto';
import { slugify } from '../src/platform/tokens.js';
import { createTokenVerifier } from '@buddyclub/auth';
import { signTestToken } from '@buddyclub/auth/testing';
import { sql } from 'kysely';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { createDb } from '../src/db/index.js';
import { PgIdentityRepository } from '../src/modules/identity/pg-repository.js';
import { PgIdempotencyStore } from '../src/plugins/idempotency.js';

const args = process.argv.slice(2);
const email = args[args.indexOf('--email') + 1];
const reset = args.includes('--reset');
if (!email || !args.includes('--email')) {
  console.error('usage: demo-content --email you@example.com [--reset]');
  process.exit(2);
}
const databaseUrl = process.env['DATABASE_URL'];
if (!databaseUrl) throw new Error('DATABASE_URL is not set (use node --env-file=.env)');
if (/supabase\.co|pooler\.supabase\.com/.test(databaseUrl) && !process.env['DEMO_ALLOW_CLOUD']) {
  console.error(
    'Refusing to seed a cloud project without DEMO_ALLOW_CLOUD=1 (this is your development project, set it to continue).',
  );
  process.exit(2);
}

const SECRET = 'demo-content-secret-at-least-32-characters-long';
const ISSUER = 'http://127.0.0.1:54321/auth/v1';
const CLUB = 'Demo Badminton Club';
const SLUG = 'demo-badminton-club';
/** Buddy Club groups seeded without a sport; each gets its own club with this slug base. */
const COMMUNITY_GROUPS = [
  {
    name: 'Winchester Book Club',
    description:
      'One novel a month, a pub table and no pressure to finish. New faces always welcome.',
    interestIds: ['books'],
    locality: 'Winchester',
    locationName: 'The Wykeham Arms',
    activities: [
      { title: 'October read: Small Things Like These', days: 5, hour: 19, capacity: 12 },
      { title: 'November pick: bring three suggestions', days: 33, hour: 19, capacity: 12 },
    ],
  },
  {
    name: 'Twyford Dog Walkers',
    description: 'Sunday morning loops along the Itchen. Dogs of every size and temperament.',
    interestIds: ['dog_walking', 'walking'],
    locality: 'Twyford',
    locationName: 'Twyford village car park',
    activities: [{ title: 'Sunday river loop (4 miles)', days: 2, hour: 9 }],
  },
  {
    name: 'Little Explorers',
    description: 'Parent and toddler mornings: messy play, songs and coffee for the grown-ups.',
    interestIds: ['parent_toddler', 'families'],
    locality: 'Winchester',
    locationName: "St Paul's church hall",
    activities: [{ title: 'Messy play Thursday', days: 3, hour: 10, capacity: 10 }],
  },
  {
    name: 'Hampshire Board Gamers',
    description: 'Modern board games, long tables, teaching games for newcomers every week.',
    interestIds: ['board_games'],
    locality: 'Eastleigh',
    locationName: 'The Cricketers',
    activities: [{ title: 'Games night', days: 6, hour: 19 }],
  },
  {
    name: 'Riverside Running Crew',
    description: '5k and 10k social runs, every pace, nobody left behind.',
    interestIds: ['running', 'wellbeing'],
    locality: 'Winchester',
    locationName: 'King Alfred statue',
    activities: [{ title: 'Easy 5k and coffee', days: 1, hour: 8 }],
  },
] as const;
const COMMUNITY_SLUGS = COMMUNITY_GROUPS.map((g) => slugify(g.name));

const db = createDb({ connectionString: databaseUrl, maxConnections: 4 });
const owner = await db
  .selectFrom('identity.user_profiles as p')
  .innerJoin(sql`auth.users`.as('u'), sql`u.id`, 'p.auth_user_id')
  .select(['p.id as profile_id', 'p.auth_user_id'])
  .where(sql`u.email`, '=', email)
  .executeTakeFirst();
if (!owner) {
  console.error(`No account with email ${email}. Sign in to the web app once first.`);
  process.exit(2);
}

const config = loadConfig({
  NODE_ENV: 'development',
  SUPABASE_URL: 'http://127.0.0.1:54321',
  SUPABASE_JWT_SECRET: SECRET,
  GUEST_TOKEN_SECRET: 'demo-guest-token-secret-at-least-32-chars',
  RATE_LIMIT_ENABLED: 'false',
  DATABASE_URL: databaseUrl,
});
const app = await buildApp({
  config,
  identityRepo: new PgIdentityRepository(db),
  tokenVerifier: createTokenVerifier({
    issuer: config.supabase.issuer,
    audience: config.supabase.audience,
    jwtSecret: SECRET,
  }),
  db,
  idempotencyStore: new PgIdempotencyStore(db),
  logger: process.env['DEMO_LOG'] ? { level: 'error' } : false,
});
await app.ready();

const token = await signTestToken({
  secret: SECRET,
  issuer: ISSUER,
  audience: 'authenticated',
  sub: owner.auth_user_id,
});
const auth = { authorization: `Bearer ${token}` };

async function api<T = Record<string, unknown>>(
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  url: string,
  payload?: unknown,
  headers: Record<string, string> = {},
): Promise<T> {
  const res = await app.inject({
    method,
    url,
    headers: { ...auth, ...headers },
    ...(method === 'GET' ? {} : { payload: (payload ?? {}) as object }),
  });
  if (res.statusCode >= 300) throw new Error(`${method} ${url} -> ${res.statusCode} ${res.body}`);
  return res.body ? (JSON.parse(res.body) as T) : (null as T);
}
const iso = (offsetMinutes: number) => new Date(Date.now() + offsetMinutes * 60_000).toISOString();

// ---------------------------------------------------------------------------------------------
if (reset) {
  // Community groups seeded below each live in a club named after them, owned by this account.
  const groupClubs = await db
    .selectFrom('community.organisations')
    .select(['id', 'slug'])
    .where('owner_profile_id', '=', owner.profile_id)
    .where((eb) =>
      eb.or(
        COMMUNITY_SLUGS.flatMap((base) => [eb('slug', '=', base), eb('slug', 'like', `${base}-%`)]),
      ),
    )
    .execute();
  for (const club of groupClubs)
    await db.deleteFrom('community.organisations').where('id', '=', club.id).execute();
  if (groupClubs.length) console.log(`reset: removed ${groupClubs.length} community group club(s)`);
  const existing = await db
    .selectFrom('community.organisations')
    .select('id')
    .where('slug', '=', SLUG)
    .executeTakeFirst();
  if (existing) {
    // Standings snapshots and result revisions are append-only; lift that for the cascade.
    await sql`alter table competition.standings_snapshots disable trigger standings_snapshots_append_only`.execute(
      db,
    );
    await sql`alter table matches.result_revisions disable trigger result_revisions_append_only`.execute(
      db,
    );
    try {
      await db
        .deleteFrom('competition.competitions')
        .where('organisation_id', '=', existing.id)
        .execute();
    } finally {
      await sql`alter table competition.standings_snapshots enable trigger standings_snapshots_append_only`.execute(
        db,
      );
      await sql`alter table matches.result_revisions enable trigger result_revisions_append_only`.execute(
        db,
      );
    }
    await db.deleteFrom('competition.teams').where('organisation_id', '=', existing.id).execute();
    await db
      .deleteFrom('activities.session_series')
      .where('organisation_id', '=', existing.id)
      .execute();
    await db.deleteFrom('platform.invitation_links').where('scope_id', '=', existing.id).execute();
    await db.deleteFrom('community.organisations').where('id', '=', existing.id).execute();
    console.log('reset: removed the previous demo club');
  }
}
const already = await db
  .selectFrom('community.organisations')
  .select('id')
  .where('slug', '=', SLUG)
  .executeTakeFirst();
if (already) {
  console.error(`The demo club already exists (${already.id}). Re-run with --reset to rebuild it.`);
  await app.close();
  await db.destroy();
  process.exit(1);
}

console.log(`Seeding demo content for ${email}…`);
const org = await api<{ id: string }>('POST', '/v1/organisations', { name: CLUB, slug: SLUG });
const orgId = org.id;
const venue = await api<{ id: string }>('POST', `/v1/organisations/${orgId}/venues`, {
  name: 'Applemore Leisure Centre',
  timezone: 'Europe/London',
});
const courtIds: string[] = [];
for (let i = 1; i <= 6; i++)
  courtIds.push(
    (await api<{ id: string }>('POST', `/v1/venues/${venue.id}/courts`, { code: String(i) })).id,
  );

// Players: 20 named club members (no accounts) with declared gender for mixed rubbers.
const names: Array<[string, 'F' | 'M']> = [
  ['Priya Kapoor', 'F'],
  ['Tom Okafor', 'M'],
  ['Aisha Khan', 'F'],
  ['Raj Sharma', 'M'],
  ['Ellie Park', 'F'],
  ['Ben Carter', 'M'],
  ['Mei Chen', 'F'],
  ['Sam Hughes', 'M'],
  ['Lucy Brown', 'F'],
  ['Ade Lawal', 'M'],
  ['Hannah Lee', 'F'],
  ['Kofi Mensah', 'M'],
  ['Grace Obi', 'F'],
  ['Dan Rowe', 'M'],
  ['Nia Evans', 'F'],
  ['Omar Diaz', 'M'],
  ['Jo Martin', 'F'],
  ['Chris Patel', 'M'],
  ['Anna Kowalski', 'F'],
  ['Leo Russo', 'M'],
];
const players: string[] = [];
for (const [displayName, gender] of names)
  players.push(
    (
      await api<{ id: string }>('POST', `/v1/organisations/${orgId}/participants`, {
        displayName,
        declaredAttributes: { gender },
        skillRating: 3 + Math.round(Math.random() * 4),
      })
    ).id,
  );
console.log(`club ${orgId}: venue with 6 courts, ${players.length} players`);

// --- Social sessions in every state ------------------------------------------------------------
const series = await api<{ id: string }>('POST', `/v1/organisations/${orgId}/sessions`, {
  name: 'Tuesday Social',
  sportId: 'badminton',
  venueId: venue.id,
  defaultRoundMinutes: 12,
  defaultDurationMinutes: 120,
  rules: { rotation: { genderMode: 'prefer_mixed', candidates: 300 } },
});
async function occurrence(startsAt: string) {
  return (await api<{ id: string }>('POST', `/v1/sessions/${series.id}/occurrences`, { startsAt }))
    .id;
}
async function fill(occurrenceId: string, count: number, checkIn: boolean) {
  for (const participantId of players.slice(0, count))
    await api('POST', `/v1/occurrences/${occurrenceId}/participants`, { participantId });
  if (checkIn) {
    await api('POST', `/v1/occurrences/${occurrenceId}/open`);
    for (const participantId of players.slice(0, count))
      await api('POST', `/v1/occurrences/${occurrenceId}/check-ins`, { participantId });
  }
}

// 1. Upcoming draft (next week), players registered.
const upcoming = await occurrence(iso(7 * 24 * 60 + 60));
await fill(upcoming, 12, false);

// 2. Open for check-in (tonight), half checked in, two walk-ins, one pair lock.
const open = await occurrence(iso(30));
await fill(open, 10, false);
await api('POST', `/v1/occurrences/${open}/open`);
for (const participantId of players.slice(0, 6))
  await api('POST', `/v1/occurrences/${open}/check-ins`, { participantId });
await api('POST', `/v1/occurrences/${open}/participants`, { displayName: 'Sam (walk-in)' });
await api('POST', `/v1/occurrences/${open}/participants`, { displayName: 'Jess (walk-in)' });
await api('POST', `/v1/occurrences/${open}/pair-locks`, {
  participantA: players[0],
  participantB: players[1],
  kind: 'hard',
});
await api('POST', `/v1/occurrences/${open}/public-access`, { enabled: true });

// 4. Completed last week: 6 rounds played.
const done = await occurrence(iso(-7 * 24 * 60));
await fill(done, 12, true);
for (let round = 1; round <= 6; round++) {
  const preview = await api<{ previewId: string; sourceVersion: number }>(
    'POST',
    `/v1/occurrences/${done}/rotations/preview`,
  );
  const committed = await api<{ id: string }>(
    'POST',
    `/v1/occurrences/${done}/rotations/commit`,
    { previewId: preview.previewId },
    { 'if-match': String(preview.sourceVersion) },
  );
  await api('POST', `/v1/rounds/${committed.id}/start`);
  await api('POST', `/v1/rounds/${committed.id}/complete`);
}
await api('POST', `/v1/occurrences/${done}/complete`);

// 5. Cancelled.
const cancelled = await occurrence(iso(3 * 24 * 60));
await api('POST', `/v1/occurrences/${cancelled}/cancel`);
console.log('sessions: upcoming, open (with walk-ins), completed, cancelled');

// --- Teams via CSV import ----------------------------------------------------------------------
const teamNames = [
  'New Forest',
  'NTA Basingstoke',
  'Winchester',
  'Southampton Uni',
  'Eastleigh',
  'Romsey',
  'Fareham',
  'Andover',
  'Salisbury',
  'Portsmouth',
  'Lymington',
  'Totton',
];
const csv = ['team,player,captain'];
teamNames.forEach((team, t) => {
  const base = t * 4;
  for (let p = 0; p < 4; p++) {
    const [name] = names[(base + p) % names.length] as [string, 'F' | 'M'];
    csv.push(`${team},${name} (${team.split(' ')[0]}),${p === 0 ? 'yes' : ''}`);
  }
});
const imported = await api<{ teamsCreated: number }>(
  'POST',
  `/v1/organisations/${orgId}/teams/import`,
  {
    csv: csv.join('\n'),
  },
);
const teams = (
  await api<{ items: { id: string; name: string }[] }>('GET', `/v1/organisations/${orgId}/teams`)
).items;
const teamId = (name: string) => teams.find((t) => t.name === name)!.id;
const rosterOf = async (id: string) =>
  (await api<{ roster: { participantId: string }[] }>('GET', `/v1/teams/${id}`)).roster.map(
    (r) => r.participantId,
  );
console.log(`teams: ${imported.teamsCreated} imported from CSV`);

async function playFixture(
  f: {
    id: string;
    home: { teamId: string } | null;
    away: { teamId: string } | null;
    rubbers: {
      matchId: string;
      rubberKey: string;
      result: unknown;
      calledAt: string | null;
      state: string;
    }[];
  },
  courtId: string,
  homeWins: number,
) {
  if (!f.home || !f.away) return;
  for (const side of [f.home, f.away]) {
    const [p1, p2, p3, p4] = (await rosterOf(side.teamId)) as [string, string, string, string];
    const rubbers: Record<string, string[]> = {};
    for (const r of f.rubbers)
      rubbers[r.rubberKey] =
        r.rubberKey === 'wd'
          ? [p1, p3]
          : r.rubberKey === 'md'
            ? [p2, p4]
            : r.rubberKey === 'xd1'
              ? [p1, p2]
              : [p3, p4];
    await api('PUT', `/v1/fixtures/${f.id}/lineups/${side.teamId}`, { rubbers });
  }
  let i = 0;
  for (const r of f.rubbers) {
    if (r.result) continue;
    await api('POST', `/v1/matches/${r.matchId}/call`, { courtId, overrideReason: 'demo' });
    await api('POST', `/v1/matches/${r.matchId}/start`);
    const margin = 3 + ((i * 5) % 9);
    await api('POST', `/v1/matches/${r.matchId}/results`, {
      games: [i < homeWins ? [21, 21 - margin] : [21 - margin, 21]],
    });
    i++;
  }
}

// --- League: 3 divisions x 4 teams, meet 1 live and half played ---------------------------------
const league = await api<{ id: string }>('POST', `/v1/organisations/${orgId}/competitions`, {
  name: 'Hampshire Regional League',
  type: 'league',
});
const season = await api<{ id: string; divisions: { id: string }[] }>(
  'POST',
  `/v1/competitions/${league.id}/seasons`,
  {
    name: '2026/27',
    startsAt: iso(-30 * 24 * 60),
    endsAt: iso(150 * 24 * 60),
    rules: {
      scoring: { targetPoints: 21, winBy: 2, cap: 30 },
      fixtureOutcome: { tieBreak: 'aggregate_points' },
    },
    divisions: [{ name: 'Division 1' }, { name: 'Division 2' }, { name: 'Division 3' }],
  },
);
const meet = await api<{ id: string }>('POST', `/v1/seasons/${season.id}/meets`, {
  name: 'Meet 1 · Applemore',
  startsAt: iso(-120),
  venueId: venue.id,
});
for (let d = 0; d < 3; d++) {
  await api('PUT', `/v1/meets/${meet.id}/divisions/${season.divisions[d]!.id}/teams`, {
    teamIds: teamNames.slice(d * 4, d * 4 + 4).map(teamId),
  });
  await api('PUT', `/v1/meets/${meet.id}/divisions/${season.divisions[d]!.id}/courts`, {
    courtIds: courtIds.slice(d * 2, d * 2 + 2),
  });
}
await api('POST', `/v1/meets/${meet.id}/fixtures/commit`);
await api('POST', `/v1/meets/${meet.id}/public-access`, { enabled: true });
type FixtureLite = Parameters<typeof playFixture>[0] & {
  divisionId: string | null;
  roundNo: number;
};
let fixtures = (await api<{ items: FixtureLite[] }>('GET', `/v1/meets/${meet.id}/fixtures`)).items;
// Division 1 fully played with the New Forest / NTA shape; divisions 2 and 3 round 1 only.
for (const f of fixtures.filter((x) => x.divisionId === season.divisions[0]!.id)) {
  const nf = f.home?.teamId === teamId('New Forest');
  await playFixture(f, courtIds[0]!, nf ? 4 : f.away?.teamId === teamId('New Forest') ? 0 : 3);
}
for (const f of fixtures.filter((x) => x.divisionId !== season.divisions[0]!.id && x.roundNo === 1))
  await playFixture(f, courtIds[2]!, 3);
// One rubber left mid-game on court 5 so the board shows "now playing".
fixtures = (await api<{ items: FixtureLite[] }>('GET', `/v1/meets/${meet.id}/fixtures`)).items;
const inPlay = fixtures.find((x) => x.divisionId === season.divisions[2]!.id && x.roundNo === 2)!;
for (const side of [inPlay.home!, inPlay.away!]) {
  const [p1, p2, p3, p4] = (await rosterOf(side.teamId)) as [string, string, string, string];
  await api('PUT', `/v1/fixtures/${inPlay.id}/lineups/${side.teamId}`, {
    rubbers: { wd: [p1, p3], md: [p2, p4], xd1: [p1, p2], xd2: [p3, p4] },
  });
}
await api('POST', `/v1/matches/${inPlay.rubbers[0]!.matchId}/call`, { courtId: courtIds[5] });
await api('POST', `/v1/matches/${inPlay.rubbers[0]!.matchId}/start`);
console.log('league: 3 divisions, meet 1 live (division 1 complete, one rubber on court 6)');

// --- Tournament: 8 teams in 2 pools into a knockout, pools played -------------------------------
const open8 = await api<{ id: string }>('POST', `/v1/organisations/${orgId}/competitions`, {
  name: 'Applemore Open',
  type: 'tournament',
});
const tSeason = await api<{ id: string; divisions: { id: string }[] }>(
  'POST',
  `/v1/competitions/${open8.id}/seasons`,
  {
    name: 'Autumn Open',
    startsAt: iso(-60),
    endsAt: iso(8 * 60),
    rules: {
      scoring: { targetPoints: 21, winBy: 1 },
      rubberTemplate: [
        { key: 'd1', label: 'Doubles', format: 'doubles', eligibility: 'open', order: 1 },
      ],
      fixtureOutcome: { tieBreak: 'aggregate_points' },
      tournament: { format: 'pools_knockout', advancePerPool: 2, seeding: 'snake' },
    },
    divisions: [{ name: 'Pool A' }, { name: 'Pool B' }],
  },
);
const event = await api<{ id: string }>('POST', `/v1/seasons/${tSeason.id}/meets`, {
  name: 'Finals day',
  startsAt: iso(-60),
  venueId: venue.id,
});
await api('PUT', `/v1/meets/${event.id}/divisions/${tSeason.divisions[0]!.id}/courts`, {
  courtIds: [courtIds[0]],
});
await api('PUT', `/v1/meets/${event.id}/divisions/${tSeason.divisions[1]!.id}/courts`, {
  courtIds: [courtIds[1]],
});
await api('PUT', `/v1/meets/${event.id}/entries`, {
  teams: teamNames.slice(0, 8).map((n, i) => ({ teamId: teamId(n), seed: i + 1 })),
});
await api('POST', `/v1/meets/${event.id}/fixtures/commit`);
await api('POST', `/v1/meets/${event.id}/public-access`, { enabled: true });
const tFixtures = (await api<{ items: FixtureLite[] }>('GET', `/v1/meets/${event.id}/fixtures`))
  .items;
const seedOf = (id: string) => teamNames.slice(0, 8).findIndex((n) => teamId(n) === id);
for (const f of tFixtures.filter((x) => x.divisionId)) {
  const homeStronger = seedOf(f.home!.teamId) < seedOf(f.away!.teamId);
  await playFixture(
    f,
    courtIds[f.divisionId === tSeason.divisions[0]!.id ? 0 : 1]!,
    homeStronger ? 1 : 0,
  );
}
console.log('tournament: 8 teams, 2 pools played, semi-finals ready');

// Last, so its in-progress round holds courts 1-3 without blocking the demo matches above.
// 3. Live: round 3 in progress, round 4 published, public board on.
const live = await occurrence(iso(-45));
await fill(live, 14, true);
await api('POST', `/v1/occurrences/${live}/public-access`, { enabled: true });
let version = (await api<{ version: number }>('GET', `/v1/occurrences/${live}`)).version;
for (let round = 1; round <= 4; round++) {
  const preview = await api<{ previewId: string; sourceVersion: number }>(
    'POST',
    `/v1/occurrences/${live}/rotations/preview`,
  );
  const committed = await api<{ id: string; occurrence?: { version: number } }>(
    'POST',
    `/v1/occurrences/${live}/rotations/commit`,
    { previewId: preview.previewId },
    { 'if-match': String(preview.sourceVersion) },
  );
  version = (await api<{ version: number }>('GET', `/v1/occurrences/${live}`)).version;
  if (round <= 3) {
    await api('POST', `/v1/rounds/${committed.id}/start`);
    if (round < 3) await api('POST', `/v1/rounds/${committed.id}/complete`);
  }
}
void version;

console.log('live session: round 3 in progress on courts 1-3, round 4 published');

// --- Buddy Club community content (Addendum 1.1 step 3) -------------------------------------
// A racket-sport group inside the demo club whose gatherings are run by the Rally sessions above...
const badmintonGroup = await api<{ id: string }>('POST', '/v1/community/groups', {
  name: 'Tuesday Badminton',
  description: 'Club night for members and friends. Rally runs the courts; just turn up.',
  interestIds: ['racket_sports', 'sports'],
  sportId: 'badminton',
  organisationId: orgId,
  locality: 'Applemore',
  locationName: 'Applemore Leisure Centre',
});
await api('POST', `/v1/community/groups/${badmintonGroup.id}/activities`, {
  title: 'Tuesday Social (club night)',
  description: 'Doors 19:00, first round 19:15. Shuttles provided.',
  interestId: 'racket_sports',
  venueId: venue.id,
  startsAt: iso(30),
  endsAt: iso(30 + 120),
  rallyOccurrenceId: open,
});
await api('POST', `/v1/community/groups/${badmintonGroup.id}/activities`, {
  title: 'Tuesday Social (next week)',
  interestId: 'racket_sports',
  venueId: venue.id,
  startsAt: iso(7 * 24 * 60 + 60),
  endsAt: iso(7 * 24 * 60 + 180),
  rallyOccurrenceId: upcoming,
});

// ...and groups with no sport at all, each in its own club, with named people going.
const at = (days: number, hour: number) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
};
const firstNames = [
  'Maya',
  'Josh',
  'Amira',
  'Ruth',
  'Theo',
  'Sofia',
  'Ivan',
  'Beth',
  'Noah',
  'Zara',
];
const initials = ['B.', 'K.', 'S.', 'M.', 'O.', 'P.'];
const groupLinks: string[] = [];
let activityCount = 0;
for (const g of COMMUNITY_GROUPS) {
  const group = await api<{ id: string; organisationId: string }>('POST', '/v1/community/groups', {
    name: g.name,
    description: g.description,
    interestIds: [...g.interestIds],
    locality: g.locality,
    locationName: g.locationName,
  });
  groupLinks.push(`  ${g.name.padEnd(26)} http://localhost:3000/groups/${group.id}`);
  // Members without accounts: participants of the group's club, so RSVPs have someone to name.
  const members: string[] = [];
  const memberCount = 4 + Math.floor(Math.random() * 5);
  for (let i = 0; i < memberCount; i++) {
    const displayName = `${firstNames[(i * 3 + g.name.length) % firstNames.length]} ${
      initials[(i + g.name.length) % initials.length]
    }`;
    members.push(
      (
        await api<{ id: string }>(
          'POST',
          `/v1/organisations/${group.organisationId}/participants`,
          {
            displayName,
          },
        )
      ).id,
    );
  }
  for (const [index, a] of g.activities.entries()) {
    const activity = await api<{ id: string }>(
      'POST',
      `/v1/community/groups/${group.id}/activities`,
      {
        title: a.title,
        interestId: g.interestIds[0],
        locationName: g.locationName,
        startsAt: at(a.days, a.hour),
        endsAt: at(a.days, a.hour + 2),
        ...('capacity' in a ? { capacity: a.capacity } : {}),
      },
    );
    activityCount++;
    await db
      .insertInto('community.activity_rsvps')
      .values(
        members.slice(0, Math.max(2, members.length - index * 2)).map((participant_id, i) => ({
          activity_id: activity.id,
          participant_id,
          status: i % 4 === 3 ? ('maybe' as const) : ('going' as const),
        })),
      )
      .execute();
    // The demo account is going to the first gathering of the first two groups.
    if (index === 0 && groupLinks.length <= 2)
      await api('POST', `/v1/community/activities/${activity.id}/rsvp`, { status: 'going' });
  }
}
console.log(
  `community: ${COMMUNITY_GROUPS.length + 1} groups (one run by Rally), ${activityCount + 2} gatherings with people going`,
);

console.log(`
Done. Open the web app signed in as ${email}:
  Buddy Club  http://localhost:3000/                (discovery home with the groups below)
  Club        http://localhost:3000/clubs/${orgId}
${groupLinks.join('\n')}
  Rally       http://rally.localhost:3000/          (Tonight: live and open sessions)
  League      http://rally.localhost:3000/league/meets/${meet.id}
  Tournament  http://rally.localhost:3000/league/meets/${event.id}
  Public boards and QR join codes are on for the open session, the live session and both events.`);
await app.close();
await db.destroy();
void randomUUID;
