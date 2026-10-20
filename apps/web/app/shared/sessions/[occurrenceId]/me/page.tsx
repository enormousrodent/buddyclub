import { ApiError } from '@buddyclub/api-client';
import type { MySchedule } from '@buddyclub/shared-types';
import { redirect } from 'next/navigation';
import { MyCourtHero } from '../../../../../components/court';
import { Countdown } from '../../../../../components/live';
import { LiveSubscription } from '../../../../../components/live-subscription';
import { Button, Card, Icon, Muted, Page, StateBadge } from '../../../../../components/ui';
import { apiForUser } from '../../../../../lib/api';
import { getSessionUser } from '../../../../../lib/supabase/server';
import { checkIn } from '../../actions';

export const metadata = { title: 'My game' };

function NextCard({ game }: { game: MySchedule['next'] }) {
  if (!game)
    return (
      <Card className="flex items-center gap-3">
        <span className="flex w-13 flex-col items-center text-muted">
          <Icon name="clock" size={26} />
        </span>
        <div className="flex flex-col gap-0.5">
          <span className="text-[15px] font-bold">Next round</span>
          <Muted>Not drawn yet. This page updates on its own.</Muted>
        </div>
      </Card>
    );
  return (
    <Card className="flex items-center gap-3">
      <span className="flex w-13 flex-col items-center">
        <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-muted">Next</span>
        <span className="font-display text-[30px] font-extrabold leading-8 tracking-tight">
          {game.resting ? '—' : game.courtCode}
        </span>
      </span>
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-[15px] font-bold">
          Round {game.sequenceNo}
          {game.resting
            ? ' · resting'
            : game.partners.length
              ? ` · with ${game.partners.map((p) => p.displayName).join(' & ')}`
              : ''}
        </span>
        <Muted>
          {game.resting
            ? 'Sit this one out'
            : `vs ${game.opponents.map((p) => p.displayName).join(' & ')} · court ${game.courtCode}`}
        </Muted>
      </div>
    </Card>
  );
}

export default async function MyGamePage({
  params,
}: {
  params: Promise<{ occurrenceId: string }>;
}) {
  const { occurrenceId } = await params;
  if (!(await getSessionUser()))
    redirect(`/sign-in?next=${encodeURIComponent(`/sessions/${occurrenceId}/me`)}`);
  let schedule: MySchedule;
  try {
    schedule = await apiForUser().occurrences.mySchedule(occurrenceId);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return (
        <Page title="My game" back={`/sessions/${occurrenceId}`}>
          <Card>
            <p className="font-semibold">You don&apos;t have a player record in this club yet.</p>
            <Muted>Ask the organiser to add you.</Muted>
          </Card>
        </Page>
      );
    }
    throw error;
  }
  const occ = schedule.occurrence;
  const liveState = occ.state === 'open' || occ.state === 'live';
  const current = schedule.current;

  return (
    <Page
      title={occ.name}
      eyebrow={schedule.attendanceStatus === 'checked_in' ? "You're checked in" : undefined}
      back={`/sessions/${occurrenceId}`}
      action={<StateBadge state={occ.state} />}
    >
      <LiveSubscription occurrenceId={occurrenceId} />
      {schedule.attendanceStatus !== 'checked_in' && liveState ? (
        <form action={checkIn.bind(null, occurrenceId, undefined)} className="mb-4">
          <Button type="submit" size="lg" className="w-full">
            <Icon name="check" size={18} />
            I&apos;m here, check me in
          </Button>
        </form>
      ) : null}
      <div className="space-y-3">
        {current ? (
          <MyCourtHero
            courtCode={current.courtCode}
            partners={current.partners.map((p) => p.displayName)}
            opponents={current.opponents.map((p) => p.displayName)}
            resting={current.resting}
            topLeft={`Now · round ${current.sequenceNo}`}
            topRight={
              <span className="text-on-ink">
                <Countdown
                  timer={current.timer}
                  serverTime={schedule.serverTime}
                  status={current.status}
                />
              </span>
            }
          />
        ) : (
          <Card tone="ink" className="py-8 text-center">
            <div className="font-display text-2xl font-bold">No round in play</div>
            <div className="mt-1 text-on-ink-muted">
              {liveState
                ? 'Your court shows here the moment a round is published.'
                : `Session is ${occ.state}.`}
            </div>
          </Card>
        )}
        <NextCard game={schedule.next} />
      </div>
      <p className="mt-4 flex items-center justify-center gap-1.5 text-xs text-muted">
        <Icon name="wave" size={12} />
        Follows the organiser&apos;s screen · updates live
      </p>
    </Page>
  );
}
