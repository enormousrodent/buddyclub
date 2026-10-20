import type { DiscoverQuery } from '@buddyclub/shared-types';
import Link from 'next/link';
import { DiscoverBlocks, InterestChips, whenShort } from '../../components/discover';
import {
  Button,
  Card,
  Icon,
  Input,
  LinkButton,
  List,
  Muted,
  Page,
  Row,
  SectionHeading,
  StateBadge,
} from '../../components/ui';
import { apiForUser, apiPublic } from '../../lib/api';
import { getSessionUser } from '../../lib/supabase/server';

const ORGANISER_ROLES = [
  'org_admin',
  'platform_admin',
  'competition_director',
  'session_organiser',
];

/**
 * Buddy Club home: discovery first (Addendum 1.1 section 6). Works signed out; signed in adds
 * what you are going to. Clubs stay reachable for the people who run them.
 */
export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; interest?: string }>;
}) {
  const { q, interest } = await searchParams;
  const user = await getSessionUser();
  const query: DiscoverQuery = {
    ...(q ? { q } : {}),
    ...(interest ? { interest } : {}),
  };
  const [discover, mine, me] = await Promise.all([
    apiPublic().community.discover(query),
    user ? apiForUser().community.mine() : Promise.resolve(null),
    user ? apiForUser().me() : Promise.resolve(null),
  ]);
  const first = me?.profile.displayName.split(' ')[0];
  const clubs = (me?.memberships ?? []).filter(
    (m) => m.organisationKind === 'club' && ORGANISER_ROLES.includes(m.role),
  );
  const going = (mine?.upcoming ?? []).filter(
    (a) => a.myRsvp === 'going' || a.myRsvp === 'maybe' || a.rally?.myAttendance,
  );

  return (
    <Page
      title={first ? `Hello, ${first}` : 'Do things together'}
      lead={
        q
          ? `Results for “${q}”`
          : 'Groups, meetups and sessions near you: sports, books, walks, families and more.'
      }
      action={
        user ? (
          <LinkButton href="/groups/new" size="sm" variant="secondary">
            New group
          </LinkButton>
        ) : undefined
      }
    >
      <form method="get" action="/" className="mb-3 flex gap-2">
        <label htmlFor="q" className="sr-only">
          Search groups and activities
        </label>
        <Input
          id="q"
          name="q"
          defaultValue={q ?? ''}
          placeholder="Padel, parkrun, knitting, toddlers…"
        />
        {interest ? <input type="hidden" name="interest" value={interest} /> : null}
        <Button type="submit" variant="secondary" aria-label="Search">
          <Icon name="search" size={18} />
        </Button>
      </form>
      <div className="mb-4">
        <InterestChips interests={discover.interests} current={interest} basePath="/" q={q} />
      </div>

      {going.length ? (
        <>
          <SectionHeading
            action={
              <Link href="/groups" className="text-[13px] font-semibold text-primary">
                Mine
              </Link>
            }
          >
            You&apos;re going
          </SectionHeading>
          <List>
            {going.slice(0, 4).map((a) => (
              <Row
                key={a.id}
                href={`/activities/${a.id}`}
                title={a.title}
                subtitle={`${whenShort(a.startsAt)} · ${a.groupName}`}
                right={<StateBadge state={a.rally?.myAttendance ?? a.myRsvp ?? 'going'} />}
              />
            ))}
          </List>
        </>
      ) : null}

      <DiscoverBlocks
        result={discover}
        emptyHint={
          interest || q
            ? 'Nothing public matches yet. Try another category, or start a group.'
            : 'No public gatherings yet. Start a group and add the first one.'
        }
      />

      <Card className="mt-6 flex items-center justify-between gap-3">
        {user ? (
          <>
            <div>
              <div className="font-semibold">Start something</div>
              <Muted>A book club, a dog walk, a toddler morning, a padel night.</Muted>
            </div>
            <LinkButton href="/groups/new" size="sm">
              New group
            </LinkButton>
          </>
        ) : (
          <>
            <div>
              <div className="font-semibold">Join in</div>
              <Muted>Sign in to join groups and say you&apos;re going.</Muted>
            </div>
            <LinkButton href="/sign-in" size="sm">
              Sign in
            </LinkButton>
          </>
        )}
      </Card>

      {clubs.length ? (
        <>
          <SectionHeading>Clubs you run</SectionHeading>
          <List>
            {clubs.map((m) => (
              <Row
                key={m.organisationId}
                href={`/clubs/${m.organisationId}`}
                title={m.organisationName}
                subtitle={`${m.role.replace(/_/g, ' ')} · members, venues, sessions`}
              />
            ))}
            <Row
              href="/clubs/new"
              title="New club"
              subtitle="For organisers who run sessions and leagues"
            />
          </List>
        </>
      ) : null}
    </Page>
  );
}
