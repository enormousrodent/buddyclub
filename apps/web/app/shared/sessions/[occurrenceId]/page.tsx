import type { Round } from '@buddyclub/shared-types';
import Link from 'next/link';
import { TimerHero } from '../../../../components/live';
import { Kicker, StatTile } from '../../../../components/rally-kit';
import { Alert, Badge, Button, Card, Icon, LinkButton, Muted } from '../../../../components/ui';
import { RATING_TAGS } from '@buddyclub/shared-types';
import { apiForUser } from '../../../../lib/api';
import { transitionOccurrence, transitionRound } from '../actions';

const TAG_LABELS = new Map<string, string>(
  [...RATING_TAGS.positive, ...RATING_TAGS.negative].map((t) => [t.id, t.label]),
);
import { AssignmentGrid, RotationPanel } from './rotation-panel';
import { loadSession, SessionFrame } from './session-shell';
import { resolveSeries } from '../resolve-series';
import { SeriesPage } from '../series-page';

export const metadata = { title: 'Session' };

/** Live round: the authoritative timer, pause / end, courts and resting (design B8). */
function LiveRound({
  round,
  serverTime,
  occurrenceId,
  canManage,
  label,
}: {
  round: Round;
  serverTime: string;
  occurrenceId: string;
  canManage: boolean;
  label: string;
}) {
  const act = (action: 'start' | 'pause' | 'resume' | 'complete' | 'cancel') =>
    transitionRound.bind(null, occurrenceId, round.id, action);
  const running = round.status === 'in_progress' || round.status === 'paused';
  return (
    <div className="space-y-3">
      <Card className="space-y-3" tone={round.status === 'in_progress' ? 'live' : 'surface'}>
        <TimerHero
          timer={round.timer}
          serverTime={serverTime}
          status={round.status}
          label={`${label} · round ${round.sequenceNo}`}
        />
        {canManage && round.status === 'published' ? (
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <form action={act('start')}>
              <Button type="submit" size="lg" className="w-full">
                <Icon name="play" size={18} />
                Start round {round.sequenceNo}
              </Button>
            </form>
            <form action={act('cancel')}>
              <Button type="submit" variant="ghost" size="lg">
                Discard
              </Button>
            </form>
          </div>
        ) : null}
        {canManage && running ? (
          <div className="grid grid-cols-2 gap-2">
            <form action={act(round.status === 'paused' ? 'resume' : 'pause')}>
              <Button type="submit" variant="secondary" size="lg" className="w-full">
                <Icon name={round.status === 'paused' ? 'play' : 'pause'} size={18} />
                {round.status === 'paused' ? 'Resume' : 'Pause'}
              </Button>
            </form>
            <form action={act('complete')}>
              <Button type="submit" variant="tonal" size="lg" className="w-full">
                End round
              </Button>
            </form>
          </div>
        ) : null}
      </Card>
      <AssignmentGrid
        round={round}
        occurrenceId={occurrenceId}
        canRecord={canManage && round.status !== 'published' && round.status !== 'cancelled'}
      />
      {round.warnings.length ? (
        <Alert tone="warning">
          <ul className="space-y-1">
            {round.warnings.map((w) => (
              <li key={`${w.code}-${w.detail}`}>{w.detail}</li>
            ))}
          </ul>
        </Alert>
      ) : null}
    </div>
  );
}

export default async function SessionPage({
  params,
}: {
  params: Promise<{ occurrenceId: string }>;
}) {
  const { occurrenceId } = await params;
  const series = await resolveSeries(occurrenceId);
  if (series) return <SeriesPage series={series} />;
  const ctx = await loadSession(occurrenceId);
  const { board, canManage, checkedIn, live, activeCourts } = ctx;
  const state = board.occurrence.state;
  const rating =
    state === 'completed' ? await apiForUser().occurrences.ratingSummary(occurrenceId) : null;
  const topTags = rating?.tags
    ? Object.entries(rating.tags)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([id]) => TAG_LABELS.get(id) ?? id)
    : [];
  const current = board.currentRound;
  const pendingPublished = current?.status === 'published' ? current : board.nextRound;
  const nextSequence =
    (board.completedRounds || 0) +
    (current && current.status !== 'completed' ? 1 : 0) +
    (board.nextRound ? 1 : 0) +
    1;
  const blocked = !live
    ? `Session is ${state}`
    : pendingPublished
      ? 'A round is published and waiting to start'
      : checkedIn.length < 4
        ? 'Need at least 4 players checked in'
        : activeCourts.length === 0
          ? 'No courts set for this session'
          : null;
  const minutes = Math.round((board.completedRounds * board.occurrence.roundDurationSeconds) / 60);

  return (
    <SessionFrame ctx={ctx}>
      {state === 'draft' && canManage ? (
        <Card className="mb-3 space-y-3">
          <Kicker>Not open yet</Kicker>
          <p className="text-[15px] leading-6 text-ink-2">
            Open the session so players can check in and join by code. You can still add people and
            courts afterwards.
          </p>
          <form action={transitionOccurrence.bind(null, occurrenceId, 'open')}>
            <Button type="submit" size="lg" className="w-full">
              Open for check-in
            </Button>
          </form>
        </Card>
      ) : null}

      {state === 'completed' ? (
        <div className="mb-4 space-y-3">
          <h2 className="font-display text-[40px] font-extrabold uppercase leading-none">
            Good night.
          </h2>
          <div className="grid grid-cols-3 gap-2.5">
            <StatTile value={board.completedRounds} label="rounds" />
            <StatTile value={board.entries.length} label="players" />
            <StatTile value={minutes} label="minutes" />
          </div>
          {rating?.canRate ? (
            <LinkButton href={`/sessions/${occurrenceId}/rate`} size="lg" className="w-full">
              How was it? Rate the night
            </LinkButton>
          ) : null}
          {rating?.myRating ? (
            <Card>
              <Muted>You rated it {'★'.repeat(rating.myRating.score) || 'no stars'}. Thanks.</Muted>
            </Card>
          ) : null}
          {canManage && rating ? (
            <Card>
              <Kicker>Ratings</Kicker>
              {rating.average !== null ? (
                <>
                  <div className="mt-1 font-display text-[32px] font-extrabold leading-none">
                    ★ {rating.average.toFixed(1)}
                  </div>
                  <Muted className="mt-1 block">
                    {rating.count} rating{rating.count === 1 ? '' : 's'}
                    {topTags.length ? ` · ${topTags.join(', ')}` : ''}
                  </Muted>
                </>
              ) : (
                <Muted className="mt-1 block">
                  {rating.count
                    ? `${rating.count} rating${rating.count === 1 ? '' : 's'} so far. The picture shows from 3, so nobody can be singled out.`
                    : 'No ratings yet. Players get a prompt on their home screen for a week.'}
                </Muted>
              )}
            </Card>
          ) : null}
          <Card tone="well">
            <Muted>Session closed. Players, pairings and the board stay on their tabs.</Muted>
          </Card>
        </div>
      ) : null}

      {current && current.status !== 'completed' ? (
        <div className="mb-4">
          <LiveRound
            round={current}
            serverTime={board.serverTime}
            occurrenceId={occurrenceId}
            canManage={canManage}
            label="Now"
          />
        </div>
      ) : null}
      {board.nextRound ? (
        <div className="mb-4">
          <Kicker className="mb-2">Next · round {board.nextRound.sequenceNo}</Kicker>
          <LiveRound
            round={board.nextRound}
            serverTime={board.serverTime}
            occurrenceId={occurrenceId}
            canManage={canManage}
            label="Next"
          />
        </div>
      ) : null}

      {live && !current && !board.nextRound && !canManage ? (
        <Card className="mb-4 py-8 text-center">
          <div className="font-display text-2xl font-bold uppercase">No round yet</div>
          <Muted className="mt-1 block">Your court shows here the moment one is published.</Muted>
        </Card>
      ) : null}

      {canManage && live ? (
        <div className="mb-4">
          {blocked && !pendingPublished ? (
            <Card className="space-y-3">
              <Kicker>Round {nextSequence}</Kicker>
              <p className="text-[15px] leading-6 text-ink-2">{blocked}.</p>
              {checkedIn.length < 4 ? (
                <LinkButton
                  href={`/sessions/${occurrenceId}/players`}
                  variant="tonal"
                  className="w-full"
                >
                  <Icon name="users" size={18} />
                  Check players in
                </LinkButton>
              ) : null}
            </Card>
          ) : !pendingPublished ? (
            <RotationPanel
              occurrenceId={occurrenceId}
              version={board.occurrence.version}
              nextSequence={nextSequence}
              blocked={blocked}
            />
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="success">{checkedIn.length} here</Badge>
        {board.occurrence.mode === 'king_of_the_court' ? (
          <Badge tone="primary">King of the court</Badge>
        ) : null}
        {board.occurrence.publicSlug ? (
          <Link href={`/board/${board.occurrence.publicSlug}`} className="inline-flex">
            <Badge tone="info">Board on TV</Badge>
          </Link>
        ) : null}
        {!canManage ? (
          <LinkButton href={`/sessions/${occurrenceId}/me`} size="sm" variant="tonal">
            Show my court
          </LinkButton>
        ) : null}
      </div>

      {canManage && live ? (
        <div className="mt-6 flex flex-wrap gap-2">
          <form action={transitionOccurrence.bind(null, occurrenceId, 'complete')}>
            <Button type="submit" variant="secondary">
              Finish session
            </Button>
          </form>
          {state === 'open' ? (
            <form action={transitionOccurrence.bind(null, occurrenceId, 'cancel')}>
              <Button type="submit" variant="danger">
                Cancel session
              </Button>
            </form>
          ) : null}
        </div>
      ) : null}
    </SessionFrame>
  );
}
