import type { MyCompetitions } from '@buddyclub/shared-types';
import type { Db } from '../../db/index.js';
import type { Actor } from '../../platform/actor.js';
import { canOrgAction } from '../../platform/authz.js';
import { toIso } from '../../platform/tokens.js';
import { listFixtures } from './meets.js';

/**
 * The player's competitions view (Addendum 1.1, Rally player view): meets in play or coming up
 * across the caller's clubs, the teams they are on, and their fixtures.
 */
export async function myCompetitions(db: Db, actor: Actor): Promise<MyCompetitions> {
  const orgIds = [...actor.memberships.entries()]
    .filter(([, m]) => m.status === 'active')
    .map(([id]) => id);
  if (orgIds.length === 0) return { teams: [], meets: [] };

  const myParticipants = await db
    .selectFrom('identity.participants')
    .select(['id', 'organisation_id'])
    .where('user_profile_id', '=', actor.profileId)
    .where('archived_at', 'is', null)
    .execute();
  const pids = myParticipants.map((p) => p.id);
  const teams = pids.length
    ? await db
        .selectFrom('competition.team_roster as r')
        .innerJoin('competition.teams as t', 't.id', 'r.team_id')
        .select(['t.id', 't.name', 't.organisation_id', 't.captain_participant_id'])
        .where('r.participant_id', 'in', pids)
        .where('r.valid_to', 'is', null)
        .where('t.archived_at', 'is', null)
        .execute()
    : [];
  const teamIds = new Set(teams.map((t) => t.id));

  const since = new Date(Date.now() - 24 * 3600 * 1000);
  const meets = await db
    .selectFrom('competition.meets as m')
    .innerJoin('competition.seasons as s', 's.id', 'm.season_id')
    .innerJoin('competition.competitions as c', 'c.id', 's.competition_id')
    .leftJoin('facilities.venues as v', 'v.id', 'm.venue_id')
    .select([
      'm.id',
      'm.name',
      'm.state',
      'm.format',
      'm.starts_at',
      'm.public_slug',
      'c.name as competition_name',
      'c.organisation_id',
      'v.name as venue_name',
    ])
    .where('c.organisation_id', 'in', orgIds)
    .where('m.state', 'in', ['published', 'live', 'draft'])
    .where('m.ends_at', '>=', since)
    .orderBy('m.starts_at')
    .limit(20)
    .execute();

  const out: MyCompetitions['meets'] = [];
  for (const m of meets) {
    const fixtures = m.state === 'draft' ? [] : await listFixtures(db, m.id);
    const mine = fixtures.filter(
      (f) => (f.home && teamIds.has(f.home.teamId)) || (f.away && teamIds.has(f.away.teamId)),
    );
    out.push({
      meetId: m.id,
      name: m.name,
      competitionName: m.competition_name,
      organisationId: m.organisation_id,
      venueName: m.venue_name,
      startsAt: toIso(m.starts_at),
      state: m.state,
      format: m.format,
      publicSlug: m.public_slug,
      canManage: canOrgAction(actor, m.organisation_id, 'competition.manage'),
      myFixtures: mine.map((f) => {
        const myTeam = f.home && teamIds.has(f.home.teamId) ? f.home : f.away!;
        const opponent = myTeam === f.home ? f.away : f.home;
        return {
          fixtureId: f.id,
          label: f.bracket ? f.bracket.label : `${f.divisionName ?? ''} · round ${f.roundNo}`,
          myTeam: myTeam.name,
          opponent: opponent?.name ?? 'TBC',
          status: f.status,
          myRubbers: f.rubbers
            .filter((r) =>
              r.sides.some((s) => s.players.some((p) => pids.includes(p.participantId))),
            )
            .map((r) => ({
              matchId: r.matchId,
              label: r.label,
              state: r.state,
              courtCode: r.courtCode,
              score: r.result
                ? r.result.forfeitedBy
                  ? `forfeit (${r.result.forfeitedBy})`
                  : r.result.games.map((g) => g.join('-')).join(', ')
                : null,
            })),
          outcome: f.outcome?.outcome ?? null,
        };
      }),
    });
  }
  return {
    teams: teams.map((t) => ({
      teamId: t.id,
      name: t.name,
      organisationId: t.organisation_id,
      isCaptain: !!t.captain_participant_id && pids.includes(t.captain_participant_id),
    })),
    meets: out,
  };
}
