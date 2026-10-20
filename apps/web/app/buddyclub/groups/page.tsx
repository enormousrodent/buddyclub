import { redirect } from 'next/navigation';
import { GroupTile, whenShort } from '../../../components/discover';
import {
  Empty,
  LinkButton,
  List,
  Page,
  Row,
  SectionHeading,
  StateBadge,
} from '../../../components/ui';
import { apiForUser } from '../../../lib/api';
import { getSessionUser } from '../../../lib/supabase/server';

export const metadata = { title: 'Mine' };

/** Your groups and what you are going to. */
export default async function MinePage() {
  if (!(await getSessionUser())) redirect('/sign-in?next=/groups');
  const mine = await apiForUser().community.mine();
  return (
    <Page
      title="Mine"
      action={
        <LinkButton href="/groups/new" size="sm" variant="secondary">
          New group
        </LinkButton>
      }
    >
      <SectionHeading>Up next</SectionHeading>
      {mine.upcoming.length ? (
        <List>
          {mine.upcoming.map((a) => (
            <Row
              key={a.id}
              href={`/activities/${a.id}`}
              title={a.title}
              subtitle={`${whenShort(a.startsAt)} · ${a.groupName}${a.rally ? ' · Powered by Rally' : ''}`}
              right={
                a.rally?.myAttendance || a.myRsvp ? (
                  <StateBadge state={a.rally?.myAttendance ?? (a.myRsvp as string)} />
                ) : undefined
              }
            />
          ))}
        </List>
      ) : (
        <Empty>Nothing coming up in your groups yet.</Empty>
      )}
      <SectionHeading>Your groups</SectionHeading>
      {mine.groups.length ? (
        <div className="flex flex-col gap-2">
          {mine.groups.map((g) => (
            <GroupTile key={g.id} g={g} />
          ))}
        </div>
      ) : (
        <Empty
          title="No groups yet"
          action={
            <LinkButton href="/explore" size="sm">
              Explore
            </LinkButton>
          }
        >
          Join a group, or start your own.
        </Empty>
      )}
      <SectionHeading>Play</SectionHeading>
      <List>
        <Row href="/sessions" title="My sessions" subtitle="Rally sessions across your clubs" />
        <Row href="/league" title="Competitions" subtitle="Fixtures and standings" />
      </List>
    </Page>
  );
}
