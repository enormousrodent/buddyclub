import { roleAllows } from '@buddyclub/auth';
import type { Dispute, Fixture, Meet, Rubber, TeamDetail } from '@buddyclub/shared-types';
import { redirect } from 'next/navigation';
import { ActionForm } from '../../../../../components/action-form';
import { QrCode } from '../../../../../components/qr-code';
import {
  Badge,
  Card,
  Empty,
  Icon,
  Input,
  LinkButton,
  Muted,
  Page,
  SectionHeading,
  Select,
  StateBadge,
  TextButton,
} from '../../../../../components/ui';
import { apiForUser } from '../../../../../lib/api';
import { absoluteUrl } from '../../../../../lib/links';
import { getSessionUser } from '../../../../../lib/supabase/server';
import {
  callToCourt,
  confirmResult,
  disputeResult,
  resolveDispute,
  setDivisionCourts,
  setDivisionTeams,
  setEntries,
  setMeetPublicAccess,
  startRubber,
  submitLineup,
  submitResult,
} from '../../actions';
import { AdvancePanel, ProgressionPanel, PublishPanel } from './panels';

export const metadata = { title: 'Meet' };

function when(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function RubberRow({
  rubber,
  meetId,
  courts,
  canOperate,
  canConfirm,
}: {
  rubber: Rubber;
  meetId: string;
  courts: { courtId: string; code: string }[];
  canOperate: boolean;
  canConfirm: boolean;
}) {
  const names = (i: number) =>
    rubber.sides[i]?.players.map((p) => p.displayName).join(' & ') || '—';
  const score = rubber.result
    ? rubber.result.forfeitedBy
      ? `forfeit (${rubber.result.forfeitedBy})`
      : rubber.result.games.map((g) => g.join('-')).join(', ')
    : '';
  const canScore =
    canOperate &&
    (rubber.state === 'in_progress' || (rubber.state === 'scheduled' && rubber.calledAt)) &&
    (!rubber.result || rubber.result.status === 'void');
  return (
    <div className="border-t border-hairline py-2 text-sm">
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-medium">{rubber.label}</span>
          <StateBadge state={rubber.state} />
          {rubber.courtCode ? <Badge tone="info">court {rubber.courtCode}</Badge> : null}
          {rubber.result ? <StateBadge state={rubber.result.status} /> : null}
        </div>
        {score ? <span className="tnum font-semibold">{score}</span> : null}
      </div>
      <div className="text-muted">
        {names(0)} <span className="text-xs">vs</span> {names(1)}
      </div>
      {canOperate && rubber.state === 'scheduled' && !rubber.calledAt && courts.length ? (
        <ActionForm
          action={callToCourt.bind(null, meetId, rubber.matchId)}
          submitLabel="Call"
          variant="secondary"
          size="sm"
          className="mt-1 flex items-center gap-2 space-y-0"
        >
          <Select name="courtId" defaultValue={courts[0]?.courtId}>
            {courts.map((c) => (
              <option key={c.courtId} value={c.courtId}>
                Court {c.code}
              </option>
            ))}
          </Select>
        </ActionForm>
      ) : null}
      {canOperate && rubber.state === 'scheduled' && rubber.calledAt ? (
        <form action={startRubber.bind(null, meetId, rubber.matchId)} className="mt-1">
          <TextButton>Start</TextButton>
        </form>
      ) : null}
      {canScore ? (
        <ActionForm
          action={submitResult.bind(null, meetId, rubber.matchId)}
          submitLabel="Save score"
          variant="secondary"
          size="sm"
          className="mt-1"
        >
          <div className="flex flex-wrap items-center gap-2">
            {[1, 2, 3].map((g) => (
              <span key={g} className="flex items-center gap-1">
                <Input
                  name={`g${g}a`}
                  type="number"
                  min={0}
                  inputMode="numeric"
                  placeholder="H"
                  className="w-16"
                />
                <span>-</span>
                <Input
                  name={`g${g}b`}
                  type="number"
                  min={0}
                  inputMode="numeric"
                  placeholder="A"
                  className="w-16"
                />
              </span>
            ))}
            <Select name="forfeitedBy" defaultValue="">
              <option value="">No forfeit</option>
              <option value="home">Home forfeits</option>
              <option value="away">Away forfeits</option>
            </Select>
          </div>
        </ActionForm>
      ) : null}
      {canConfirm && rubber.result?.status === 'submitted' ? (
        <form
          action={confirmResult.bind(null, meetId, rubber.matchId, rubber.result.revision)}
          className="mt-1"
        >
          <TextButton>Confirm score</TextButton>
        </form>
      ) : null}
      {canConfirm &&
      rubber.result &&
      (rubber.result.status === 'submitted' || rubber.result.status === 'confirmed') ? (
        <details className="mt-1">
          <summary className="cursor-pointer text-[13px] font-bold text-danger">Dispute</summary>
          <ActionForm
            action={disputeResult.bind(null, meetId, rubber.matchId, rubber.result.revision)}
            submitLabel="Raise dispute"
            variant="danger"
            size="sm"
            className="mt-2"
            resetOnSuccess={false}
          >
            <Input
              name="reason"
              placeholder="What is wrong with this score?"
              required
              minLength={3}
            />
          </ActionForm>
        </details>
      ) : null}
    </div>
  );
}

function LineupForm({
  fixture,
  team,
  meetId,
}: {
  fixture: Fixture;
  team: TeamDetail;
  meetId: string;
}) {
  return (
    <ActionForm
      action={submitLineup.bind(null, fixture.id, team.id, meetId)}
      submitLabel={`Save ${team.name} lineup`}
      variant="secondary"
      resetOnSuccess={false}
    >
      <div className="grid gap-2 sm:grid-cols-2">
        {fixture.rubbers.map((r) => (
          <div key={r.matchId} className="rounded-control border border-hairline p-2">
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">
              {r.label}
            </div>
            {Array.from({ length: r.format === 'doubles' ? 2 : 1 }, (_, i) => {
              const side = r.sides.find((s) => s.teamId === team.id);
              const current = side?.players[i]?.participantId ?? '';
              return (
                <Select key={i} name={`rubber:${r.rubberKey}:${i + 1}`} defaultValue={current}>
                  <option value="">—</option>
                  {team.roster.map((p) => (
                    <option key={p.participantId} value={p.participantId}>
                      {p.displayName}
                    </option>
                  ))}
                </Select>
              );
            })}
          </div>
        ))}
      </div>
    </ActionForm>
  );
}

function sideLabel(f: Fixture, side: 'home' | 'away'): string {
  const team = side === 'home' ? f.home : f.away;
  if (team) return team.name;
  const src = f.bracket?.sources[side];
  if (!src) return 'TBC';
  if (src.type === 'seed') return `Seed ${src.seed}`;
  return `${src.type === 'winner' ? 'Winner' : 'Loser'} of R${src.round} tie ${src.slot}`;
}

function FixtureCard({
  f,
  meetId,
  pool,
  canOperate,
  canConfirm,
}: {
  f: Fixture;
  meetId: string;
  pool: { courtId: string; code: string }[];
  canOperate: boolean;
  canConfirm: boolean;
}) {
  const winner =
    f.winnerTeamId && f.home && f.away
      ? f.winnerTeamId === f.home.teamId
        ? f.home.name
        : f.away.name
      : null;
  return (
    <Card className="mb-3">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="font-medium">
            {sideLabel(f, 'home')} vs {sideLabel(f, 'away')}
          </div>
          <Muted>
            {f.bracket
              ? `${f.bracket.label} · tie ${f.bracket.slot}`
              : `${f.divisionName ?? ''} · round ${f.roundNo}`}
            {winner ? ` · ${winner} won` : ''}
          </Muted>
        </div>
        <div className="text-right text-sm">
          <StateBadge state={f.status} />
          {f.outcome ? (
            <div className="tnum">
              {f.outcome.rubbersWon.join('-')} rubbers · {f.outcome.pointsFor.join('-')} pts
            </div>
          ) : null}
        </div>
      </div>
      {f.home && f.away && (f.status === 'scheduled' || f.status === 'in_progress') ? (
        <a
          href={`/league/meets/${meetId}?lineup=${f.id}#lineups`}
          className="text-sm font-semibold text-primary"
        >
          Lineups
        </a>
      ) : null}
      {f.home && f.away
        ? f.rubbers.map((r) => (
            <RubberRow
              key={r.matchId}
              rubber={r}
              meetId={meetId}
              courts={pool}
              canOperate={canOperate}
              canConfirm={canConfirm}
            />
          ))
        : null}
    </Card>
  );
}

function DisputesPanel({
  disputes,
  meetId,
  canManage,
}: {
  disputes: Dispute[];
  meetId: string;
  canManage: boolean;
}) {
  if (!disputes.length) return null;
  return (
    <>
      <SectionHeading>Disputes · {disputes.length}</SectionHeading>
      {disputes.map((d) => (
        <Card key={`${d.matchId}-${d.revision}`} className="mb-3 space-y-2" tone="surface">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="font-semibold">
                {d.home} vs {d.away} · {d.rubberLabel}
              </div>
              <Muted>
                {d.divisionName ? `${d.divisionName} · ` : ''}revision {d.revision} ·{' '}
                {d.forfeitedBy
                  ? `forfeit (${d.forfeitedBy})`
                  : d.games.map((g) => g.join('-')).join(', ')}
                {d.submittedAs ? ` · entered by ${d.submittedAs}` : ''}
              </Muted>
            </div>
            <Badge tone="danger">disputed</Badge>
          </div>
          {d.reason ? <p className="text-sm">“{d.reason}”</p> : null}
          {canManage ? (
            <ActionForm
              action={resolveDispute.bind(null, meetId, d.matchId, d.revision)}
              submitLabel="Resolve"
              variant="secondary"
              size="sm"
              resetOnSuccess={false}
            >
              <div className="grid grid-cols-[auto_1fr] gap-2">
                <Select name="decision" defaultValue="uphold">
                  <option value="uphold">Uphold the score</option>
                  <option value="void">Void it and replay</option>
                </Select>
                <Input name="reason" placeholder="Why" required minLength={3} maxLength={400} />
              </div>
            </ActionForm>
          ) : null}
        </Card>
      ))}
    </>
  );
}

export default async function MeetPage({
  params,
  searchParams,
}: {
  params: Promise<{ meetId: string }>;
  searchParams: Promise<{ lineup?: string }>;
}) {
  const { meetId } = await params;
  const { lineup } = await searchParams;
  if (!(await getSessionUser()))
    redirect(`/sign-in?next=${encodeURIComponent(`/league/meets/${meetId}`)}`);
  const api = apiForUser();
  const meet: Meet = await api.meets.get(meetId);
  const org = await api.organisations.get(meet.organisationId);
  const canManage = org.myRole ? roleAllows(org.myRole, 'competition.manage') : false;
  const canOperate = org.myRole ? roleAllows(org.myRole, 'match.operate') : false;
  const canConfirm = canManage || (org.myRole ? roleAllows(org.myRole, 'result.confirm') : false);
  const published = meet.state !== 'draft';
  const tournament = meet.format === 'pools_knockout';
  const [teams, venue, fixtures, standings, disputes] = await Promise.all([
    api.teams.list(meet.organisationId),
    meet.venueId ? api.venues.get(meet.venueId) : Promise.resolve(null),
    published ? api.meets.fixtures(meetId) : Promise.resolve({ items: [] as Fixture[] }),
    published ? api.meets.standings(meetId) : Promise.resolve(null),
    published ? api.meets.disputes(meetId) : Promise.resolve({ items: [] as Dispute[] }),
  ]);
  const lineupFixture = lineup ? fixtures.items.find((f) => f.id === lineup) : undefined;
  const lineupTeams =
    lineupFixture && lineupFixture.home && lineupFixture.away
      ? await Promise.all([
          api.teams.get(lineupFixture.home.teamId),
          api.teams.get(lineupFixture.away.teamId),
        ])
      : [];
  const poolFixtures = fixtures.items.filter((f) => f.stage === 'pool');
  const knockout = fixtures.items.filter((f) => f.stage === 'knockout' && f.bracket);
  const koRounds = [...new Set(knockout.map((f) => f.bracket!.round))].sort((a, b) => a - b);
  const allCourts = meet.divisions.flatMap((d) => d.courts);
  const entered = new Map(
    meet.divisions.flatMap((d) => d.teams.map((t) => [t.teamId, t.seed] as const)),
  );
  const boardUrl = meet.publicSlug ? await absoluteUrl(`/board/${meet.publicSlug}`) : null;

  return (
    <Page
      title={meet.name}
      eyebrow={`${meet.competitionName} · ${meet.seasonName}`}
      back={`/league/seasons/${meet.seasonId}`}
      action={<StateBadge state={meet.state} />}
    >
      <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted">
        <span>{when(meet.startsAt)}</span>
        <span className="inline-flex items-center gap-1">
          <Icon name="pin" size={14} />
          {meet.venueName ?? 'no venue'}
        </span>
        <span>{tournament ? 'Pools into knockout' : 'Round robin'}</span>
        {published ? (
          <span>
            {meet.counts.completedFixtures}/{meet.counts.fixtures} fixtures · {meet.counts.rubbers}{' '}
            rubbers
          </span>
        ) : null}
      </div>

      {canManage ? (
        <Card className="mb-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="font-semibold">Public board</div>
              <Muted>A read-only screen for the hall or a link for spectators.</Muted>
            </div>
            <ActionForm
              action={setMeetPublicAccess.bind(null, meetId, !meet.publicSlug)}
              submitLabel={meet.publicSlug ? 'Turn off' : 'Turn on'}
              variant={meet.publicSlug ? 'secondary' : 'primary'}
              size="sm"
              resetOnSuccess={false}
            />
          </div>
          {boardUrl ? (
            <>
              <QrCode url={boardUrl} caption="Scan for the live board" size={160} />
              <LinkButton href={`/board/${meet.publicSlug}`} variant="tonal" className="w-full">
                Open the board
              </LinkButton>
            </>
          ) : null}
        </Card>
      ) : meet.publicSlug ? (
        <div className="mb-4">
          <LinkButton href={`/board/${meet.publicSlug}`} variant="tonal" className="w-full">
            Open the live board
          </LinkButton>
        </div>
      ) : null}

      {canManage && !published && tournament ? (
        <Card className="mb-4 space-y-2">
          <h2 className="font-semibold">Entries and draw</h2>
          <Muted>
            Tick the teams playing and give seeds to the strongest. The draw snakes them into{' '}
            {meet.divisions.length} pools.
          </Muted>
          <ActionForm
            action={setEntries.bind(null, meetId)}
            submitLabel="Draw the pools"
            resetOnSuccess={false}
          >
            <div className="grid gap-1 text-sm sm:grid-cols-2">
              {teams.items.map((t) => (
                <label key={t.id} className="flex min-h-10 items-center gap-2">
                  <input
                    type="checkbox"
                    name="teamIds"
                    value={t.id}
                    defaultChecked={entered.has(t.id)}
                    className="h-5 w-5"
                  />
                  <span className="min-w-0 flex-1 truncate">{t.name}</span>
                  <Input
                    name={`seed:${t.id}`}
                    type="number"
                    min={1}
                    max={999}
                    inputMode="numeric"
                    placeholder="seed"
                    defaultValue={entered.get(t.id) ?? ''}
                    className="w-20 min-h-9"
                  />
                </label>
              ))}
            </div>
          </ActionForm>
        </Card>
      ) : null}

      {meet.divisions.map(({ division, teams: assigned, courts }) => (
        <Card key={division.id} className="mb-4">
          <h2 className="font-semibold">{division.name}</h2>
          <Muted>
            {assigned
              .map((t) => (t.seed && tournament ? `${t.name} (${t.seed})` : t.name))
              .join(', ') || 'no teams'}{' '}
            · courts {courts.map((c) => c.code).join(', ') || 'none'}
          </Muted>
          {canManage && !published && !tournament ? (
            <ActionForm
              action={setDivisionTeams.bind(null, meetId, division.id)}
              submitLabel="Save teams"
              variant="secondary"
              size="sm"
              resetOnSuccess={false}
              className="mt-2"
            >
              <div className="grid grid-cols-2 gap-1 text-sm">
                {teams.items.map((t) => (
                  <label key={t.id} className="flex min-h-9 items-center gap-2">
                    <input
                      type="checkbox"
                      name="teamIds"
                      value={t.id}
                      defaultChecked={assigned.some((a) => a.teamId === t.id)}
                      className="h-5 w-5"
                    />{' '}
                    {t.name}
                  </label>
                ))}
              </div>
            </ActionForm>
          ) : null}
          {canManage && venue && meet.state !== 'completed' ? (
            <ActionForm
              action={setDivisionCourts.bind(null, meetId, division.id)}
              submitLabel="Save courts"
              variant="secondary"
              size="sm"
              resetOnSuccess={false}
              className="mt-2"
            >
              <div className="flex flex-wrap gap-3 text-sm">
                {venue.courts
                  .filter((c) => c.active)
                  .map((c) => (
                    <label key={c.id} className="flex min-h-9 items-center gap-1">
                      <input
                        type="checkbox"
                        name="courtIds"
                        value={c.id}
                        defaultChecked={courts.some((x) => x.courtId === c.id)}
                        className="h-5 w-5"
                      />{' '}
                      {c.code}
                    </label>
                  ))}
              </div>
            </ActionForm>
          ) : null}
        </Card>
      ))}

      {canManage && !published ? <PublishPanel meetId={meetId} /> : null}

      {lineupFixture && lineupTeams.length ? (
        <Card className="mb-4 space-y-3">
          <h2 className="font-semibold">
            Lineups · {lineupFixture.home?.name} vs {lineupFixture.away?.name}
          </h2>
          {lineupTeams.map((t) => (
            <LineupForm key={t.id} fixture={lineupFixture} team={t} meetId={meetId} />
          ))}
        </Card>
      ) : null}

      {published ? (
        <>
          <DisputesPanel disputes={disputes.items} meetId={meetId} canManage={canManage} />

          {knockout.length ? (
            <>
              <SectionHeading>
                Knockout · {meet.counts.knockoutResolved}/{meet.counts.knockoutFixtures} ties set
              </SectionHeading>
              {canManage ? (
                <div className="mb-3">
                  <AdvancePanel
                    meetId={meetId}
                    pendingCount={meet.counts.knockoutFixtures - meet.counts.knockoutResolved}
                  />
                </div>
              ) : null}
              {koRounds.map((round) => (
                <div key={round}>
                  <h3 className="mb-2 mt-3 text-sm font-bold">
                    {knockout.find((f) => f.bracket!.round === round)!.bracket!.label}
                  </h3>
                  {knockout
                    .filter((f) => f.bracket!.round === round)
                    .map((f) => (
                      <FixtureCard
                        key={f.id}
                        f={f}
                        meetId={meetId}
                        pool={allCourts}
                        canOperate={canOperate}
                        canConfirm={canConfirm}
                      />
                    ))}
                </div>
              ))}
            </>
          ) : null}

          <SectionHeading>{tournament ? 'Pool fixtures' : 'Fixtures'}</SectionHeading>
          {poolFixtures.length === 0 ? <Empty>No fixtures.</Empty> : null}
          {poolFixtures.map((f) => (
            <FixtureCard
              key={f.id}
              f={f}
              meetId={meetId}
              pool={meet.divisions.find((d) => d.division.id === f.divisionId)?.courts ?? []}
              canOperate={canOperate}
              canConfirm={canConfirm}
            />
          ))}

          {standings ? (
            <>
              <SectionHeading>{tournament ? 'Pool standings' : 'Standings'}</SectionHeading>
              {standings.divisions
                .filter((d) => d.rows.length)
                .map((d) => (
                  <Card key={d.divisionId} className="scroll-x mb-3">
                    <div className="mb-1 flex items-center justify-between">
                      <h3 className="font-semibold">{d.divisionName}</h3>
                      <Muted>
                        rev {d.revision} · {d.pendingFixtures} pending
                      </Muted>
                    </div>
                    <table className="tnum w-full text-sm">
                      <thead className="text-left text-xs uppercase text-muted">
                        <tr>
                          <th>#</th>
                          <th>Team</th>
                          <th>P</th>
                          <th>W</th>
                          <th>D</th>
                          <th>L</th>
                          <th>Rub</th>
                          <th>+/-</th>
                        </tr>
                      </thead>
                      <tbody>
                        {d.rows.map((r) => (
                          <tr
                            key={r.teamId}
                            className={r.tiedWith.length ? 'text-warning-ink' : ''}
                          >
                            <td>{r.rank}</td>
                            <td>{r.teamName}</td>
                            <td>{r.played}</td>
                            <td>{r.fixtureWins}</td>
                            <td>{r.fixtureDraws}</td>
                            <td>{r.fixtureLosses}</td>
                            <td>
                              {r.rubbersWon}-{r.rubbersLost}
                            </td>
                            <td>
                              {r.pointsDifference > 0
                                ? `+${r.pointsDifference}`
                                : r.pointsDifference}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {d.unresolvedTies.length ? (
                      <Muted>Unresolved tie: director decision required before progression.</Muted>
                    ) : null}
                  </Card>
                ))}
              <Muted>
                Ranked by {standings.criteria.join(', then ')} · rules {standings.rulesetVersion}
              </Muted>
            </>
          ) : null}

          {canManage && !tournament && meet.state !== 'completed' ? (
            <ProgressionPanel meetId={meetId} />
          ) : null}
        </>
      ) : null}
    </Page>
  );
}
