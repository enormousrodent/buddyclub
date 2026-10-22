import type { MySession } from '@buddyclub/shared-types';
import Link from 'next/link';
import { IconTile } from '../../../../components/brand';
import { SessionCard } from '../../../../components/session-card';
import { UpcomingList } from '../../../../components/upcoming-list';
import { Countdown } from '../../../../components/live';
import {
  Card,
  Empty,
  Icon,
  LinkButton,
  List,
  Muted,
  Page,
  Row,
  SectionHeading,
  StateBadge,
} from '../../../../components/ui';
import { apiForUser } from '../../../../lib/api';
import { isHappeningNow, isUpcoming } from '../../../../lib/sessions';
import { getSessionUser } from '../../../../lib/supabase/server';
import { JoinCodeForm } from '../../join-code';

function when(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Resume hero: the session that is live or open right now, with round, timer and courts. */
function ResumeHero({ s }: { s: MySession }) {
  const href = s.canManage ? `/sessions/${s.occurrenceId}` : `/sessions/${s.occurrenceId}/me`;
  const live = s.live;
  return (
    <Link
      href={href}
      className="mb-3 flex flex-col gap-3 rounded-[20px] border-2 border-live bg-surface p-4"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.06em]">
          <span className="h-1.75 w-1.75 rounded-full bg-ink" aria-hidden />
          {s.canManage ? 'Resume' : 'Live now'} · {s.organisationName}
        </span>
        <StateBadge state={s.state} />
      </div>
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="font-display text-2xl font-bold leading-tight">{s.seriesName}</div>
          <div className="text-[13px] text-muted">
            {live?.roundNo
              ? `Round ${live.roundNo} · ${live.courtsInPlay} court${live.courtsInPlay === 1 ? '' : 's'} in play · ${live.playersHere} here`
              : `${live?.playersHere ?? 0} checked in · no round yet`}
          </div>
        </div>
        {live?.timer && live.roundStatus ? (
          <Countdown timer={live.timer} serverTime={live.serverTime} status={live.roundStatus} />
        ) : null}
      </div>
      <span className="inline-flex min-h-12 items-center justify-center gap-2 rounded-control bg-primary text-[15px] font-bold text-primary-ink">
        {s.canManage ? 'Resume session' : 'Show my court'}
        <Icon name="chevron" size={18} />
      </span>
    </Link>
  );
}

export default async function RallyHomePage({
  searchParams,
}: {
  searchParams: Promise<{ joined?: string; completed?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) {
    // Design A1: the welcome screen. Get started goes to sign-in; a code goes straight to a session.
    return (
      <main className="relative mx-auto flex min-h-[calc(100dvh-3.5rem)] w-full max-w-xl flex-col justify-end gap-5 overflow-hidden px-5 pb-12 pt-6">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              'linear-gradient(var(--bc-live) 1px, transparent 1px), linear-gradient(90deg, var(--bc-live) 1px, transparent 1px)',
            backgroundSize: '56px 56px',
            maskImage: 'radial-gradient(ellipse at 50% 20%, black 10%, transparent 65%)',
          }}
        />
        <div className="relative">
          <IconTile product="rally" size={72} />
        </div>
        <h1 className="relative font-display text-[64px] font-extrabold uppercase leading-[0.92]">
          Run the
          <br />
          session.
        </h1>
        <p className="relative text-base leading-6 text-ink-2">
          Fair rotations, a live court board and one timer everyone agrees with.
        </p>
        <div className="relative flex flex-col gap-2.5 pt-2">
          <LinkButton
            href="/sign-in?next=/dashboard"
            size="lg"
            className="w-full font-display text-[22px] uppercase tracking-[0.06em]"
          >
            Get started
          </LinkButton>
          <details className="group rounded-card border border-hairline bg-surface p-3">
            <summary className="cursor-pointer list-none text-center text-[15px] font-bold text-primary">
              Got a code? Join a session
            </summary>
            <div className="mt-3">
              <JoinCodeForm />
            </div>
          </details>
        </div>
        <p className="relative text-center text-xs text-muted">Buddy Club</p>
      </main>
    );
  }

  // The first run (name and sports) is enforced by the app layout.
  const { joined, completed } = await searchParams;

  const api = apiForUser();
  const [me, sessions, presets, competitions, pendingRatings, scheduled, profile] =
    await Promise.all([
      api.me(),
      api.sessions.mine(),
      api.sessions.presets(),
      api.competitions.mine(),
      api.sessions.pendingRatings(),
      api.sessions.scheduled(),
      api.profile.get(),
    ]);
  // The profile-completion card (Addendum 1.4 step 4) waits until a second night has been played.
  const attended = sessions.items.filter(
    (s) =>
      s.state === 'completed' && (s.myAttendance === 'checked_in' || s.myAttendance === 'left'),
  ).length;
  const suggestCompletion = !profile.onboarded.buddyclub && attended >= 2;
  const myClubs = me.memberships.filter(
    (m) => m.organisationKind === 'club' && m.status === 'active',
  );
  const meets = competitions.meets
    .filter((m) => m.state !== 'completed' && m.state !== 'cancelled')
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
    .slice(0, 3);
  // Anyone can start a session: /start creates a personal workspace when there is no club (ADR-017).
  const canStart = true;
  const live = sessions.items.filter((s) => isHappeningNow(s));
  const upcoming = sessions.items.filter((s) => isUpcoming(s));
  const past = sessions.items.filter((s) => s.state === 'completed').slice(0, 5);
  const resume = live.find((s) => s.canManage) ?? live[0];
  const clubs = me.memberships.filter((m) => m.organisationKind === 'club').length;

  const section = (title: string, items: MySession[]) =>
    items.length ? (
      <>
        <SectionHeading>{title}</SectionHeading>
        <List>
          {items.map((s) => (
            <Row
              key={s.occurrenceId}
              href={s.canManage ? `/sessions/${s.occurrenceId}` : `/sessions/${s.occurrenceId}/me`}
              title={s.seriesName}
              subtitle={`${s.organisationName} · ${when(s.startsAt)}${s.venueName ? ` · ${s.venueName}` : ''}`}
              right={<StateBadge state={s.myAttendance ?? s.state} />}
            />
          ))}
        </List>
      </>
    ) : null;

  return (
    <Page title="Home">
      {joined ? (
        <Card className="mb-3 border-live">
          <div className="font-display text-[22px] font-bold uppercase leading-none">
            You&apos;re in.
          </div>
          <Muted className="mt-1 block">
            Your club&apos;s sessions show up here. On the night, check in with the code and
            you&apos;ll see your court.
          </Muted>
        </Card>
      ) : null}
      {completed ? (
        <Card className="mb-3 border-live">
          <div className="font-display text-[22px] font-bold uppercase leading-none">
            You&apos;re all set.
          </div>
          <Muted className="mt-1 block">
            Buddies can see your level and when you&apos;re free. Change any of it from your
            profile.
          </Muted>
        </Card>
      ) : null}
      {resume ? <ResumeHero s={resume} /> : null}

      {pendingRatings.items.slice(0, 2).map((r) => (
        <Link
          key={r.occurrenceId}
          href={`/sessions/${r.occurrenceId}/rate`}
          className="mb-3 flex items-center justify-between gap-3 rounded-card border border-hairline bg-surface px-4 py-3"
        >
          <span className="min-w-0">
            <span className="block truncate text-[15px] font-bold">
              How was {r.seriesName} on {when(r.startsAt)}?
            </span>
            <span className="block text-[13px] text-muted">
              Two taps. Nobody sees who said what.
            </span>
          </span>
          <span className="shrink-0 text-xl text-primary">★★★★★</span>
        </Link>
      ))}

      {suggestCompletion ? (
        <Link
          href="/profile/complete"
          className="mb-3 flex items-center justify-between gap-3 rounded-card border border-primary bg-surface px-4 py-3"
        >
          <span className="min-w-0">
            <span className="block text-[15px] font-bold">Want more games?</span>
            <span className="block text-[13px] text-muted">
              Say how good you are and when you&apos;re free, so the people you play with can find
              you for a hit.
            </span>
          </span>
          <Icon name="chevron" size={18} className="shrink-0 text-primary" />
        </Link>
      ) : null}

      {canStart ? (
        <Link
          href="/start"
          className="mb-3 flex min-h-22 items-center justify-between gap-3 rounded-[20px] bg-primary px-5 text-primary-ink"
        >
          <span className="flex flex-col gap-0.5">
            <span className="font-display text-[26px] font-bold leading-tight">
              Start a session
            </span>
            <span className="text-[13px] font-medium opacity-80">
              {presets.items.length
                ? 'Quick setup, or pick one of your sessions below'
                : 'Sport, courts, rounds. No club needed.'}
            </span>
          </span>
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-live text-live-ink">
            <Icon name="chevron" size={22} />
          </span>
        </Link>
      ) : null}

      {presets.items.length ? (
        <>
          <SectionHeading
            action={
              <Link href="/sessions" className="text-[13px] font-semibold text-primary">
                All sessions
              </Link>
            }
          >
            Your sessions
          </SectionHeading>
          <div className="scroll-row -mx-5 flex gap-2.5 px-5 pb-1 sm:mx-0 sm:px-0">
            {presets.items.map((p) => (
              <SessionCard key={p.seriesId} p={p} compact />
            ))}
          </div>
        </>
      ) : null}

      <SectionHeading>Join a session</SectionHeading>
      <Card>
        <JoinCodeForm />
        <Muted className="mt-2 block">
          Scan the organiser&apos;s QR code, or type the code under it.
        </Muted>
      </Card>

      {upcoming.length ||
      live.some((s) => s !== resume) ||
      scheduled.items.some((s) => s.nextAt) ? (
        <>
          <SectionHeading>Tonight and upcoming</SectionHeading>
          <UpcomingList
            nights={upcoming.concat(live.filter((s) => s !== resume))}
            scheduled={scheduled.items}
          />
        </>
      ) : null}

      {myClubs.length ? (
        <>
          <SectionHeading>Your clubs</SectionHeading>
          <List>
            {myClubs.map((m) => (
              <Row
                key={m.organisationId}
                href={`/clubs/${m.organisationId}`}
                leading={<Icon name="users" size={22} className="text-primary" />}
                title={m.organisationName}
                subtitle="Sessions, nights played, members and venues"
                right={<StateBadge state={m.role} />}
              />
            ))}
          </List>
        </>
      ) : null}

      <SectionHeading
        action={
          <Link href="/league" className="text-[13px] font-semibold text-primary">
            All
          </Link>
        }
      >
        Competitions
      </SectionHeading>
      <List>
        {meets.map((m) => (
          <Row
            key={m.meetId}
            href={`/league/meets/${m.meetId}`}
            leading={<Icon name="trophy" size={22} className="text-primary" />}
            title={m.competitionName}
            subtitle={`${m.name} · ${when(m.startsAt)}${m.myFixtures[0] ? ` · v ${m.myFixtures[0].opponent}` : ''}`}
            right={<StateBadge state={m.state} />}
          />
        ))}
        {meets.length === 0 ? (
          <Row
            href="/league"
            leading={<Icon name="trophy" size={22} className="text-primary" />}
            title="Leagues and tournaments"
            subtitle="Your fixtures, standings and the ones you run"
          />
        ) : null}
      </List>

      {sessions.items.length === 0 && presets.items.length === 0 ? (
        <div className="mt-6">
          <Empty
            title="Nothing yet"
            action={
              <LinkButton href="/start" size="sm">
                Start a session
              </LinkButton>
            }
          >
            {clubs === 0
              ? 'Start on your own, or ask an organiser for a code to join theirs.'
              : 'Your clubs have nothing scheduled.'}
          </Empty>
        </div>
      ) : null}
      {section('Recent', past)}
    </Page>
  );
}
