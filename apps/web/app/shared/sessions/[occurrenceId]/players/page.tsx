import { ActionForm } from '../../../../../components/action-form';
import { Kicker } from '../../../../../components/rally-kit';
import {
  Avatar,
  Button,
  Card,
  Field,
  Icon,
  Input,
  LinkButton,
  List,
  Muted,
  Row,
  Select,
  StateBadge,
  TextButton,
} from '../../../../../components/ui';
import { apiForUser } from '../../../../../lib/api';
import {
  addClubPlayer,
  addWalkIn,
  checkIn,
  checkInEveryone,
  noShow,
  withdraw,
} from '../../actions';
import { loadSession, SessionFrame } from '../session-shell';

export const metadata = { title: 'Players' };

/** Roster and check-in (design B4): who is here, who is expected, walk-ins, and the first round. */
export default async function PlayersPage({
  params,
}: {
  params: Promise<{ occurrenceId: string }>;
}) {
  const { occurrenceId } = await params;
  const ctx = await loadSession(occurrenceId, '/players');
  const { board, org, canManage, checkedIn, registered, live, myParticipantId } = ctx;
  const clubPlayers = canManage ? (await apiForUser().participants.list(org.id)).items : [];
  const onRoster = new Set(
    board.entries
      .filter((e) => e.attendanceStatus !== 'left' && e.attendanceStatus !== 'no_show')
      .map((e) => e.participantId),
  );
  const candidates = clubPlayers.filter((p) => !onRoster.has(p.id));
  const apart = new Map<string, string[]>();
  for (const l of board.pairLocks) {
    if (l.kind !== 'avoid') continue;
    const name = (id: string) =>
      board.entries.find((e) => e.participantId === id)?.displayName ?? '?';
    apart.set(l.participantA, [...(apart.get(l.participantA) ?? []), name(l.participantB)]);
    apart.set(l.participantB, [...(apart.get(l.participantB) ?? []), name(l.participantA)]);
  }
  const others = board.entries.filter(
    (e) => e.attendanceStatus !== 'checked_in' && e.attendanceStatus !== 'registered',
  );
  const myEntry = myParticipantId
    ? board.entries.find((e) => e.participantId === myParticipantId)
    : undefined;

  const subtitle = (e: (typeof board.entries)[number]) =>
    [
      e.source === 'guest' ? 'Guest tonight' : null,
      apart.get(e.participantId)?.length
        ? `keep apart: ${apart.get(e.participantId)!.join(', ')}`
        : null,
    ]
      .filter(Boolean)
      .join(' · ') || undefined;

  const controls = (e: (typeof board.entries)[number]) =>
    canManage && live ? (
      <div className="flex items-center gap-2">
        {e.attendanceStatus === 'registered' ? (
          <>
            <form action={checkIn.bind(null, occurrenceId, e.participantId)}>
              <TextButton>Here</TextButton>
            </form>
            <form action={noShow.bind(null, occurrenceId, e.participantId)}>
              <TextButton danger>No-show</TextButton>
            </form>
          </>
        ) : null}
        {e.attendanceStatus === 'checked_in' ? (
          <form action={withdraw.bind(null, occurrenceId, e.participantId)}>
            <TextButton danger>Left</TextButton>
          </form>
        ) : null}
      </div>
    ) : (
      <StateBadge state={e.attendanceStatus} />
    );

  return (
    <SessionFrame ctx={ctx}>
      {myParticipantId && live && myEntry && myEntry.attendanceStatus !== 'checked_in' ? (
        <form action={checkIn.bind(null, occurrenceId, undefined)} className="mb-3">
          <Button type="submit" size="lg" className="w-full">
            <Icon name="check" size={18} />
            I&apos;m here
          </Button>
        </form>
      ) : null}

      {canManage && live ? (
        <div className="mb-4 grid grid-cols-2 gap-2.5">
          <LinkButton href={`/sessions/${occurrenceId}/share`} variant="tonal">
            <Icon name="qr" size={18} />
            Show join QR
          </LinkButton>
          <a
            href="#walk-in"
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-control border-[1.5px] border-ink text-[15px] font-bold text-ink"
          >
            <Icon name="plus" size={18} />
            Walk-in
          </a>
        </div>
      ) : null}

      <Kicker className="mb-2">Here ({checkedIn.length})</Kicker>
      {checkedIn.length ? (
        <List>
          {checkedIn.map((e) => (
            <Row
              key={e.participantId}
              leading={<Avatar name={e.displayName} src={e.avatarUrl} />}
              title={e.displayName}
              subtitle={subtitle(e)}
              right={controls(e)}
            />
          ))}
        </List>
      ) : (
        <Card tone="well">
          <Muted>Nobody checked in yet. Show the QR or mark people as here.</Muted>
        </Card>
      )}

      {registered.length ? (
        <>
          <div className="mb-2 mt-5 flex items-center justify-between gap-3">
            <Kicker>Expected, not here yet ({registered.length})</Kicker>
            {canManage && live ? (
              <form action={checkInEveryone.bind(null, occurrenceId)}>
                <TextButton>Check everyone in</TextButton>
              </form>
            ) : null}
          </div>
          <List>
            {registered.map((e) => (
              <Row
                key={e.participantId}
                leading={<Avatar name={e.displayName} src={e.avatarUrl} />}
                title={e.displayName}
                subtitle={subtitle(e)}
                right={controls(e)}
              />
            ))}
          </List>
        </>
      ) : null}

      {others.length ? (
        <>
          <Kicker className="mb-2 mt-5">Gone ({others.length})</Kicker>
          <List>
            {others.map((e) => (
              <Row
                key={e.participantId}
                leading={<Avatar name={e.displayName} src={e.avatarUrl} />}
                title={e.displayName}
                right={<StateBadge state={e.attendanceStatus} />}
              />
            ))}
          </List>
        </>
      ) : null}

      {canManage && live ? (
        <>
          <div id="walk-in" className="mt-5 grid gap-3 sm:grid-cols-2">
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
          <div className="mt-5">
            <LinkButton href={`/sessions/${occurrenceId}`} size="lg" className="w-full">
              {board.completedRounds || board.currentRound
                ? 'Back to the round'
                : 'Call the first round'}
              <Icon name="chevron" size={18} />
            </LinkButton>
          </div>
        </>
      ) : null}
    </SessionFrame>
  );
}
