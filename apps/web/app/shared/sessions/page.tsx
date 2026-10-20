import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  Empty,
  Icon,
  LinkButton,
  List,
  Page,
  Row,
  SectionHeading,
  StateBadge,
} from '../../../components/ui';
import { apiForUser } from '../../../lib/api';
import { getSessionUser } from '../../../lib/supabase/server';

export const metadata = { title: 'Sessions' };

function when(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Every session the signed-in person is part of, in any club, grouped by state. */
export default async function MySessionsPage() {
  if (!(await getSessionUser())) redirect('/sign-in?next=/sessions');
  const sessions = await apiForUser().sessions.mine();
  const rally = (await headers()).get('x-buddyclub-product') === 'rally';
  const startHref = rally ? '/start' : '/clubs';
  const groups: [string, typeof sessions.items][] = [
    ['Now', sessions.items.filter((s) => s.state === 'live' || s.state === 'open')],
    ['Upcoming', sessions.items.filter((s) => s.state === 'draft')],
    ['Past', sessions.items.filter((s) => s.state === 'completed' || s.state === 'cancelled')],
  ];
  return (
    <Page
      title="Sessions"
      lead="Everything you're down for, across your clubs."
      action={
        <LinkButton href={startHref} size="sm">
          <Icon name="plus" size={16} />
          New
        </LinkButton>
      }
    >
      {sessions.items.length === 0 ? (
        <Empty
          title="Nothing yet"
          action={
            <LinkButton href={startHref} size="sm">
              Start a session
            </LinkButton>
          }
        >
          Start one yourself, or wait for an organiser to schedule one in your club.
        </Empty>
      ) : null}
      {groups.map(([title, items]) =>
        items.length ? (
          <section key={title} className="mt-6 first:mt-0">
            <SectionHeading>{title}</SectionHeading>
            <List>
              {items.map((s) => (
                <Row
                  key={s.occurrenceId}
                  href={
                    s.canManage ? `/sessions/${s.occurrenceId}` : `/sessions/${s.occurrenceId}/me`
                  }
                  title={s.seriesName}
                  subtitle={`${s.organisationName} · ${when(s.startsAt)}${s.venueName ? ` · ${s.venueName}` : ''}`}
                  right={<StateBadge state={s.myAttendance ?? s.state} />}
                />
              ))}
            </List>
          </section>
        ) : null,
      )}
    </Page>
  );
}
