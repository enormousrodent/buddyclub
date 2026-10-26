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
import { UpcomingList } from '../../../components/upcoming-list';
import { apiForUser } from '../../../lib/api';
import { isHappeningNow, isUpcoming } from '../../../lib/sessions';
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
  const api = apiForUser();
  const [sessions, scheduled] = await Promise.all([api.sessions.mine(), api.sessions.scheduled()]);
  const rally = (await headers()).get('x-buddyclub-product') === 'rally';
  const startHref = rally ? '/start' : '/clubs';
  const now = sessions.items.filter((s) => isHappeningNow(s));
  const upcoming = sessions.items.filter((s) => isUpcoming(s));
  const past = sessions.items.filter((s) => s.state === 'completed' || s.state === 'cancelled');
  const groups: [string, typeof sessions.items][] = [
    ['Now', now],
    ['Past', past],
  ];
  const nothing =
    sessions.items.length === 0 && !scheduled.items.some((s) => s.nextAt && !s.nextOccurrenceId);
  return (
    <Page
      title="Sessions"
      lead="Everything you're down for, across your clubs."
      action={
        <span className="flex gap-2">
          <LinkButton href="/explore" size="sm" variant="secondary">
            <Icon name="search" size={16} />
            Near you
          </LinkButton>
          <LinkButton href={startHref} size="sm">
            <Icon name="plus" size={16} />
            New
          </LinkButton>
        </span>
      }
    >
      {nothing ? (
        <Empty
          title="Nothing yet"
          action={
            <LinkButton href={startHref} size="sm">
              Start a session
            </LinkButton>
          }
        >
          Find a club near you, ask an organiser for a code, or start one yourself.
        </Empty>
      ) : null}
      {now.length ? (
        <section className="mt-6 first:mt-0">
          <SectionHeading>Now</SectionHeading>
          <UpcomingList nights={now} scheduled={[]} />
        </section>
      ) : null}
      {upcoming.length || scheduled.items.some((s) => s.nextAt && !s.nextOccurrenceId) ? (
        <section className="mt-6 first:mt-0">
          <SectionHeading>Upcoming</SectionHeading>
          <UpcomingList nights={upcoming} scheduled={scheduled.items} />
        </section>
      ) : null}
      {groups.slice(1).map(([title, items]) =>
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
