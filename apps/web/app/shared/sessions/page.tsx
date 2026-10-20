import { redirect } from 'next/navigation';
import { Empty, List, Page, Row, SectionHeading, StateBadge } from '../../../components/ui';
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
  const groups: [string, typeof sessions.items][] = [
    ['Now', sessions.items.filter((s) => s.state === 'live' || s.state === 'open')],
    ['Upcoming', sessions.items.filter((s) => s.state === 'draft')],
    ['Past', sessions.items.filter((s) => s.state === 'completed' || s.state === 'cancelled')],
  ];
  return (
    <Page title="Sessions" lead="Everything you're down for, across your clubs.">
      {sessions.items.length === 0 ? (
        <Empty title="Nothing yet">
          When an organiser schedules a session in one of your clubs, it appears here.
        </Empty>
      ) : null}
      {groups.map(([title, items]) =>
        items.length ? (
          <section key={title}>
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
