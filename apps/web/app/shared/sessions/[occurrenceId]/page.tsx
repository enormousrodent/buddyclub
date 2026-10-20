import { roleAllows } from '@buddyclub/auth';
import type { Board, Round } from '@buddyclub/shared-types';
import { redirect } from 'next/navigation';
import { ActionForm } from '../../../../components/action-form';
import { Countdown, TimerHero } from '../../../../components/live';
import { LiveSubscription } from '../../../../components/live-subscription';
import {
  Avatar,
  Badge,
  Button,
  Card,
  Field,
  Icon,
  Input,
  LinkButton,
  List,
  Muted,
  Page,
  Row,
  SectionHeading,
  Select,
  StateBadge,
  TextButton,
} from '../../../../components/ui';
import { apiForUser } from '../../../../lib/api';
import { getSessionUser } from '../../../../lib/supabase/server';
import {
  addClubPlayer,
  addPairLock,
  addWalkIn,
  checkIn,
  issueSessionGuestLink,
  noShow,
  releasePairLock,
  transitionOccurrence,
  transitionRound,
  setOccurrencePublicAccess,
  withdraw,
} from '../actions';
import { AssignmentGrid, RotationPanel } from './rotation-panel';
import { QrCode } from '../../../../components/qr-code';
import { absoluteUrl } from '../../../../lib/links';

export const metadata = { title: 'Session' };

function when(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function RoundControls({ round, occurrenceId }: { round: Round; occurrenceId: string }) {
  const act = (action: 'start' | 'pause' | 'resume' | 'complete' | 'cancel') =>
    transitionRound.bind(null, occurrenceId, round.id, action);
  if (round.status === 'published')
    return (
      <div className="flex gap-2">
        <form action={act('start')} className="flex-1">
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
    );
  if (round.status === 'in_progress' || round.status === 'paused')
    return (
      <div className="flex gap-2">
        <form action={act(round.status === 'paused' ? 'resume' : 'pause')} className="flex-1">
          <Button type="submit" variant="secondary" size="lg" className="w-full">
            <Icon name={round.status === 'paused' ? 'play' : 'pause'} size={18} />
            {round.status === 'paused' ? 'Resume' : 'Pause'}
          </Button>
        </form>
        <form action={act('complete')} className="flex-1">
          <Button type="submit" size="lg" className="w-full">
            End round
          </Button>
        </form>
      </div>
    );
  return null;
}

function RoundCard({
  round,
  serverTime,
  occurrenceId,
  canManage,
  label,
  hero,
}: {
  round: Round;
  serverTime: string;
  occurrenceId: string;
  canManage: boolean;
  label: string;
  hero: boolean;
}) {
  return (
    <Card className="space-y-3" tone={hero && round.status === 'in_progress' ? 'live' : 'surface'}>
      {hero ? (
        <TimerHero
          timer={round.timer}
          serverTime={serverTime}
          status={round.status}
          label={`${label} · round ${round.sequenceNo}`}
        />
      ) : (
        <div className="flex items-center justify-between gap-3">
          <div className="text-[13px] font-bold uppercase tracking-[0.06em] text-muted">
            {label} · round {round.sequenceNo}
          </div>
          <Countdown timer={round.timer} serverTime={serverTime} status={round.status} />
        </div>
      )}
      <AssignmentGrid round={round} />
      {canManage ? <RoundControls round={round} occurrenceId={occurrenceId} /> : null}
    </Card>
  );
}

export default async function SessionPage({
  params,
}: {
  params: Promise<{ occurrenceId: string }>;
}) {
  const { occurrenceId } = await params;
  if (!(await getSessionUser()))
    redirect(`/sign-in?next=${encodeURIComponent(`/sessions/${occurrenceId}`)}`);
  const api = apiForUser();
  const board: Board = await api.occurrences.board(occurrenceId);
  const org = await api.organisations.get(board.occurrence.organisationId);
  const canManage = org.myRole ? roleAllows(org.myRole, 'session.manage') : false;
  const me = await api.me();
  const myParticipantId = me.participants.find((p) => p.organisationId === org.id)?.id ?? null;
  const myEntry = myParticipantId
    ? board.entries.find((e) => e.participantId === myParticipantId)
    : undefined;

  const clubPlayers = canManage ? (await api.participants.list(org.id)).items : [];
  const onRoster = new Set(
    board.entries
      .filter((e) => e.attendanceStatus !== 'left' && e.attendanceStatus !== 'no_show')
      .map((e) => e.participantId),
  );
  const candidates = clubPlayers.filter((p) => !onRoster.has(p.id));
  const checkedIn = board.entries.filter((e) => e.attendanceStatus === 'checked_in');
  const state = board.occurrence.state;
  const live = state === 'open' || state === 'live';
  const current = board.currentRound;
  const pendingPublished = current?.status === 'published' ? current : board.nextRound;
  const nextSequence =
    (board.completedRounds || 0) +
    (current && current.status !== 'completed' ? 1 : 0) +
    (board.nextRound ? 1 : 0) +
    1;
  const activeCourts = board.courts.filter((c) => c.active);
  const blocked = !live
    ? `Session is ${state}`
    : pendingPublished
      ? 'A round is published and waiting to start'
      : checkedIn.length < 4
        ? 'Need at least 4 players checked in'
        : activeCourts.length === 0
          ? 'No courts set for this session'
          : null;
  const name = (id: string) =>
    board.entries.find((e) => e.participantId === id)?.displayName ?? '?';

  return (
    <Page
      title={board.occurrence.name}
      eyebrow={`${org.name} · ${when(board.occurrence.startsAt)}`}
      back={canManage ? `/clubs/${org.id}/sessions` : '/'}
      action={<StateBadge state={state} />}
    >
      <LiveSubscription occurrenceId={occurrenceId} />

      <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted">
        <span className="inline-flex items-center gap-1">
          <Icon name="pin" size={14} />
          {board.occurrence.venueName ?? 'No venue'}
        </span>
        <span>
          {activeCourts.length} court{activeCourts.length === 1 ? '' : 's'}
          {activeCourts.length ? ` (${activeCourts.map((c) => c.code).join(', ')})` : ''}
        </span>
        <span>{Math.round(board.occurrence.roundDurationSeconds / 60)} min rounds</span>
        <span>{board.completedRounds} played</span>
        <span className="inline-flex items-center gap-1">
          <Icon name="users" size={14} />
          {checkedIn.length} here
        </span>
      </div>

      {canManage ? (
        <div className="mb-4 flex flex-wrap gap-2">
          {state === 'draft' ? (
            <form action={transitionOccurrence.bind(null, occurrenceId, 'open')}>
              <Button type="submit" size="lg">
                Open for check-in
              </Button>
            </form>
          ) : null}
          {live ? (
            <form action={transitionOccurrence.bind(null, occurrenceId, 'complete')}>
              <Button type="submit" variant="secondary">
                Finish session
              </Button>
            </form>
          ) : null}
          {state === 'draft' || state === 'open' ? (
            <form action={transitionOccurrence.bind(null, occurrenceId, 'cancel')}>
              <Button type="submit" variant="danger">
                Cancel session
              </Button>
            </form>
          ) : null}
          <LinkButton href={`/sessions/${occurrenceId}/me`} variant="ghost">
            My game
          </LinkButton>
        </div>
      ) : (
        <div className="mb-4">
          <LinkButton href={`/sessions/${occurrenceId}/me`} variant="tonal" className="w-full">
            Show my court
          </LinkButton>
        </div>
      )}

      {current && current.status !== 'completed' ? (
        <div className="mb-4">
          <RoundCard
            round={current}
            serverTime={board.serverTime}
            occurrenceId={occurrenceId}
            canManage={canManage}
            label="Now"
            hero
          />
        </div>
      ) : null}
      {board.nextRound ? (
        <div className="mb-4">
          <RoundCard
            round={board.nextRound}
            serverTime={board.serverTime}
            occurrenceId={occurrenceId}
            canManage={canManage}
            label="Next"
            hero={!current || current.status === 'completed'}
          />
        </div>
      ) : null}
      {current && current.status === 'completed' && !board.nextRound ? (
        <Card tone="well" className="mb-4">
          <Muted>Round {current.sequenceNo} finished. Preview the next one below.</Muted>
        </Card>
      ) : null}

      {canManage && live ? (
        <div className="mb-4">
          <RotationPanel
            occurrenceId={occurrenceId}
            version={board.occurrence.version}
            nextSequence={nextSequence}
            blocked={blocked}
          />
        </div>
      ) : null}

      <SectionHeading>Players · {checkedIn.length} here</SectionHeading>
      {myParticipantId && live && myEntry?.attendanceStatus !== 'checked_in' ? (
        <form action={checkIn.bind(null, occurrenceId, undefined)} className="mb-3">
          <Button type="submit" size="lg" className="w-full">
            <Icon name="check" size={18} />
            I&apos;m here
          </Button>
        </form>
      ) : null}
      <List>
        {board.entries.map((e) => (
          <Row
            key={e.participantId}
            leading={<Avatar name={e.displayName} />}
            title={e.displayName}
            subtitle={e.source === 'guest' ? 'Guest · no account' : undefined}
            right={
              <div className="flex items-center gap-2">
                <StateBadge state={e.attendanceStatus} />
                {canManage && live && e.attendanceStatus === 'registered' ? (
                  <>
                    <form action={checkIn.bind(null, occurrenceId, e.participantId)}>
                      <TextButton>Check in</TextButton>
                    </form>
                    <form action={noShow.bind(null, occurrenceId, e.participantId)}>
                      <TextButton danger>No-show</TextButton>
                    </form>
                  </>
                ) : null}
                {canManage &&
                live &&
                (e.attendanceStatus === 'checked_in' || e.attendanceStatus === 'registered') ? (
                  <form action={withdraw.bind(null, occurrenceId, e.participantId)}>
                    <TextButton danger>Left</TextButton>
                  </form>
                ) : null}
              </div>
            }
          />
        ))}
      </List>

      {canManage && live ? (
        <>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Card>
              <ActionForm
                action={addWalkIn.bind(null, occurrenceId)}
                submitLabel="Add walk-in"
                variant="secondary"
              >
                <Field label="Walk-in name" hint="No account needed. They can get a link later.">
                  <Input name="displayName" placeholder="Sam" required maxLength={120} />
                </Field>
              </ActionForm>
            </Card>
            {candidates.length ? (
              <Card>
                <ActionForm
                  action={addClubPlayer.bind(null, occurrenceId)}
                  submitLabel="Add player"
                  variant="secondary"
                >
                  <Field label="Club player">
                    <Select name="participantId">
                      {candidates.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.displayName}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <label className="flex min-h-11 items-center gap-2 text-sm">
                    <input type="checkbox" name="checkIn" defaultChecked className="h-5 w-5" /> Here
                    now
                  </label>
                </ActionForm>
              </Card>
            ) : null}
          </div>

          <SectionHeading>Partner locks</SectionHeading>
          {board.pairLocks.length ? (
            <List>
              {board.pairLocks.map((l) => (
                <Row
                  key={l.id}
                  leading={<Icon name="lock" size={20} className="text-muted" />}
                  title={`${name(l.participantA)} & ${name(l.participantB)}`}
                  subtitle={l.kind}
                  right={
                    <form action={releasePairLock.bind(null, occurrenceId, l.id)}>
                      <TextButton danger>Release</TextButton>
                    </form>
                  }
                />
              ))}
            </List>
          ) : null}
          {checkedIn.length >= 2 ? (
            <Card className="mt-3">
              <ActionForm
                action={addPairLock.bind(null, occurrenceId)}
                submitLabel="Lock partners"
                variant="secondary"
              >
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Player">
                    <Select name="participantA">
                      {checkedIn.map((e) => (
                        <option key={e.participantId} value={e.participantId}>
                          {e.displayName}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Partner">
                    <Select name="participantB" defaultValue={checkedIn[1]?.participantId}>
                      {checkedIn.map((e) => (
                        <option key={e.participantId} value={e.participantId}>
                          {e.displayName}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>
              </ActionForm>
            </Card>
          ) : null}

          <SectionHeading>Public board and QR join</SectionHeading>
          <Card className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <Muted>
                A hall screen with courts and the timer, and a code members scan to check in.
              </Muted>
              <ActionForm
                action={setOccurrencePublicAccess.bind(
                  null,
                  occurrenceId,
                  !board.occurrence.publicSlug,
                )}
                submitLabel={board.occurrence.publicSlug ? 'Turn off' : 'Turn on'}
                variant={board.occurrence.publicSlug ? 'secondary' : 'primary'}
                size="sm"
                resetOnSuccess={false}
              />
            </div>
            {board.occurrence.publicSlug ? (
              <>
                <QrCode
                  url={await absoluteUrl(`/join/${board.occurrence.publicSlug}`)}
                  caption="Scan to check in"
                  size={160}
                />
                <LinkButton
                  href={`/board/${board.occurrence.publicSlug}`}
                  variant="tonal"
                  className="w-full"
                >
                  Open the court board
                </LinkButton>
              </>
            ) : null}
          </Card>

          <SectionHeading>Guest links</SectionHeading>
          <Card>
            <Muted>
              Give a walk-in a link that shows their court and the timer on their own phone.
            </Muted>
            <div className="mt-2 space-y-2">
              {board.entries
                .filter((e) => e.source === 'guest' && e.attendanceStatus === 'checked_in')
                .map((e) => (
                  <div
                    key={e.participantId}
                    className="flex items-center justify-between gap-2 text-sm"
                  >
                    <span className="font-semibold">{e.displayName}</span>
                    <ActionForm
                      action={issueSessionGuestLink.bind(null, occurrenceId, e.participantId)}
                      submitLabel="Link"
                      variant="secondary"
                      size="sm"
                      resetOnSuccess={false}
                      className="space-y-0"
                    />
                  </div>
                ))}
              {!board.entries.some(
                (e) => e.source === 'guest' && e.attendanceStatus === 'checked_in',
              ) ? (
                <Badge>No checked-in guests</Badge>
              ) : null}
            </div>
          </Card>
        </>
      ) : null}
    </Page>
  );
}
