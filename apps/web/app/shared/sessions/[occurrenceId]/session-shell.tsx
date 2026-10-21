import type { Board } from '@buddyclub/shared-types';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { LiveSubscription } from '../../../../components/live-subscription';
import { OfflineBanner } from '../../../../components/offline-banner';
import { SessionTabs } from '../../../../components/rally-kit';
import { Badge, Icon, Page, StateBadge } from '../../../../components/ui';
import { apiForUser } from '../../../../lib/api';
import { getSessionUser } from '../../../../lib/supabase/server';

/** Everything the session screens share: the board, the club, what the viewer may do. */
export interface SessionContext {
  occurrenceId: string;
  board: Board;
  org: { id: string; name: string };
  canManage: boolean;
  myParticipantId: string | null;
  checkedIn: Board['entries'];
  registered: Board['entries'];
  live: boolean;
  activeCourts: Board['courts'];
  /** Where Back goes: the app home on the Rally host, the Buddy Club home otherwise. */
  homeHref: string;
}

export async function loadSession(occurrenceId: string, path = ''): Promise<SessionContext> {
  if (!(await getSessionUser()))
    redirect(`/sign-in?next=${encodeURIComponent(`/sessions/${occurrenceId}${path}`)}`);
  const api = apiForUser();
  const board: Board = await api.occurrences.board(occurrenceId);
  const [org, me] = await Promise.all([
    api.organisations.get(board.occurrence.organisationId),
    api.me(),
  ]);
  // Organisers of the club, and hosts of the session while hosting is switched on.
  const canManage = board.canManage;
  const product = (await headers()).get('x-buddyclub-product');
  const state = board.occurrence.state;
  return {
    occurrenceId,
    board,
    org: { id: org.id, name: org.name },
    canManage,
    myParticipantId: me.participants.find((p) => p.organisationId === org.id)?.id ?? null,
    checkedIn: board.entries.filter((e) => e.attendanceStatus === 'checked_in'),
    registered: board.entries.filter((e) => e.attendanceStatus === 'registered'),
    live: state === 'open' || state === 'live',
    activeCourts: board.courts.filter((c) => c.active),
    homeHref: product === 'rally' ? '/dashboard' : '/',
  };
}

export function when(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Page frame for every session screen: title, state, meta line and the segmented tabs. */
export function SessionFrame({
  ctx,
  children,
  action,
}: {
  ctx: SessionContext;
  children: ReactNode;
  action?: ReactNode;
}) {
  const { board, org, canManage, checkedIn, activeCourts, occurrenceId, homeHref } = ctx;
  const base = `/sessions/${occurrenceId}`;
  const tabs = canManage
    ? [
        { href: '', label: 'Live' },
        {
          href: '/players',
          label: 'Players',
          badge: <Badge tone="neutral">{checkedIn.length}</Badge>,
        },
        {
          href: '/pairings',
          label: 'Pairings',
          badge: board.pairLocks.length ? (
            <Badge tone="neutral">{board.pairLocks.length}</Badge>
          ) : undefined,
        },
        { href: '/share', label: 'Share' },
      ]
    : [
        { href: '', label: 'Board' },
        { href: '/me', label: 'My court' },
      ];
  return (
    <Page
      title={board.occurrence.name}
      eyebrow={`${org.name} · ${when(board.occurrence.startsAt)}`}
      back={homeHref}
      action={action ?? <StateBadge state={board.occurrence.state} />}
    >
      <LiveSubscription occurrenceId={occurrenceId} />
      <OfflineBanner since={board.serverTime} />
      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted">
        <span className="inline-flex items-center gap-1">
          <Icon name="pin" size={14} />
          {board.occurrence.venueName ?? 'No venue'}
        </span>
        <span>
          {activeCourts.length} court{activeCourts.length === 1 ? '' : 's'}
        </span>
        <span>{Math.round(board.occurrence.roundDurationSeconds / 60)} min</span>
        <span>{board.completedRounds} played</span>
        <span className="inline-flex items-center gap-1">
          <Icon name="users" size={14} />
          {checkedIn.length} here
        </span>
      </div>
      <SessionTabs base={base} items={tabs} />
      {children}
    </Page>
  );
}
