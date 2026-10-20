import type { MySession, Preset } from '@buddyclub/shared-types';
import Link from 'next/link';
import { IconTile } from '../../components/brand';
import { Countdown } from '../../components/live';
import {
  Button,
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
} from '../../components/ui';
import { apiForUser } from '../../lib/api';
import { getSessionUser } from '../../lib/supabase/server';
import { startPreset } from './actions';
import { JoinCodeForm } from './join-code';

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

function PresetCard({ p }: { p: Preset }) {
  return (
    <div className="flex w-50 shrink-0 flex-col gap-2 rounded-card border border-hairline bg-surface p-3.5">
      <div className="flex items-start justify-between gap-2">
        <Icon name="clock" size={20} className="shrink-0 text-primary" />
        {p.organisationKind === 'personal' ? (
          <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-muted">
            Just me
          </span>
        ) : (
          <span className="truncate text-[11px] font-bold uppercase tracking-[0.06em] text-muted">
            {p.organisationName}
          </span>
        )}
      </div>
      <div className="text-[15px] font-bold leading-5">{p.name}</div>
      <div className="text-xs leading-4 text-muted">
        {p.sportId} · {p.courts} court{p.courts === 1 ? '' : 's'} · {p.defaultRoundMinutes} min
        rounds{p.venueName ? ` · ${p.venueName}` : ''}
      </div>
      {p.activeOccurrenceId ? (
        <LinkButton href={`/sessions/${p.activeOccurrenceId}`} variant="tonal" size="sm">
          Open tonight&apos;s
        </LinkButton>
      ) : (
        <form action={startPreset.bind(null, p.seriesId)}>
          <Button type="submit" size="sm" variant="tonal" className="w-full">
            <Icon name="play" size={14} />
            Start now
          </Button>
        </form>
      )}
    </div>
  );
}

export default async function RallyHomePage() {
  const user = await getSessionUser();
  if (!user) {
    return (
      <Page title="Run the session" lead="Fair rotations, live court boards and league nights.">
        <Card className="flex flex-col items-start gap-4">
          <IconTile product="rally" size={64} />
          <p className="text-[15px] leading-6 text-ink-2">
            Sign in to start a session in under a minute, run it from your phone, and let every
            player see their court on theirs. No club needed.
          </p>
          <LinkButton href="/sign-in" size="lg" className="w-full">
            Sign in
          </LinkButton>
          <Muted>
            Got a code or a link from an organiser? Open it on this phone and it just works.
          </Muted>
        </Card>
        <SectionHeading>Join a session</SectionHeading>
        <Card>
          <JoinCodeForm />
        </Card>
      </Page>
    );
  }

  const api = apiForUser();
  const [me, sessions, presets] = await Promise.all([
    api.me(),
    api.sessions.mine(),
    api.sessions.presets(),
  ]);
  // Anyone can start a session: /start creates a personal workspace when there is no club (ADR-017).
  const canStart = true;
  const live = sessions.items.filter((s) => s.state === 'live' || s.state === 'open');
  const upcoming = sessions.items.filter((s) => s.state === 'draft');
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
      {resume ? <ResumeHero s={resume} /> : null}

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
                ? 'Quick setup, or pick a preset below'
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
            Presets
          </SectionHeading>
          <div className="-mx-5 flex gap-2.5 overflow-x-auto px-5 pb-1">
            {presets.items.map((p) => (
              <PresetCard key={p.seriesId} p={p} />
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

      {section('Upcoming', upcoming.concat(live.filter((s) => s !== resume)))}

      <SectionHeading>Competitions</SectionHeading>
      <List>
        <Row
          href="/league"
          leading={<Icon name="trophy" size={22} className="text-primary" />}
          title="Leagues and tournaments"
          subtitle="Your fixtures, standings and the ones you run"
        />
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
