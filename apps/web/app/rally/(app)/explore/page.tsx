import Link from 'next/link';
import { Button, Empty, Icon, Input, List, Page, Row, Select } from '../../../../components/ui';
import { apiForUser, apiPublic } from '../../../../lib/api';
import { describeSchedule, whenIn } from '../../../../lib/sessions';
import { RALLY_SPORTS, rallySportName } from '../../../../lib/sports';
import { getSessionUser } from '../../../../lib/supabase/server';
import { joinSession } from './actions';

export const metadata = { title: 'Near you' };

/**
 * Near you (Addendum 1.5): public sessions by place and sport. An open one can be joined on the
 * spot; an invitation-only one says so. The session is the group, so there is nothing else to
 * discover.
 */
export default async function NearYouPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; locality?: string; sport?: string }>;
}) {
  const { q, locality, sport: rawSport } = await searchParams;
  const sport = RALLY_SPORTS.find((s) => s === rawSport) ?? '';
  const [user, result] = await Promise.all([
    getSessionUser(),
    apiPublic().sessions.public({
      ...(q ? { q } : {}),
      ...(locality ? { locality } : {}),
      ...(sport ? { sport } : {}),
    }),
  ]);
  const me = user ? await apiForUser().me() : null;
  const myOrgs = new Set(
    (me?.memberships ?? []).filter((m) => m.status === 'active').map((m) => m.organisationId),
  );

  return (
    <Page
      title="Near you"
      back="/sessions"
      lead="Public sessions by place and sport. Join an open one, or ask for a link."
    >
      <form method="get" action="/explore" className="mb-4 flex flex-col gap-2">
        <div className="flex gap-2">
          <label htmlFor="q" className="sr-only">
            Search
          </label>
          <Input id="q" name="q" defaultValue={q ?? ''} placeholder="Session or club name" />
          <Button type="submit" variant="secondary" aria-label="Search">
            <Icon name="search" size={18} />
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Input name="locality" defaultValue={locality ?? ''} placeholder="Town or area" />
          <Select name="sport" defaultValue={sport}>
            <option value="">Any sport</option>
            {RALLY_SPORTS.map((s) => (
              <option key={s} value={s}>
                {rallySportName(s)}
              </option>
            ))}
          </Select>
        </div>
      </form>
      {result.items.length ? (
        <List>
          {result.items.map((s) => {
            const where = s.venueName ?? s.locality;
            const subtitle = [
              s.organisationName,
              s.sportName,
              s.schedule ? describeSchedule(s.schedule) : null,
              s.nextAt ? `next ${whenIn(s.nextAt)}` : null,
              where,
              `${s.regulars} regular${s.regulars === 1 ? '' : 's'}`,
            ]
              .filter(Boolean)
              .join(' · ');
            const member = myOrgs.has(s.organisationId);
            return (
              <Row
                key={s.id}
                {...(member ? { href: `/sessions/${s.id}` } : {})}
                title={s.name}
                subtitle={subtitle}
                right={
                  member ? (
                    <span className="text-[13px] font-semibold text-primary">Open</span>
                  ) : s.joinPolicy !== 'open' ? (
                    <span className="text-[12px] font-semibold text-muted">Invite only</span>
                  ) : user ? (
                    <form action={joinSession.bind(null, s.id)}>
                      <Button type="submit" size="sm">
                        Join
                      </Button>
                    </form>
                  ) : (
                    <Link
                      href={`/sign-in?next=${encodeURIComponent('/explore')}`}
                      className="text-[13px] font-bold text-primary"
                    >
                      Sign in to join
                    </Link>
                  )
                }
              />
            );
          })}
        </List>
      ) : (
        <Empty title="Nothing public here yet">
          Sessions appear as organisers make them public. Got a code or a link? Use that instead.
        </Empty>
      )}
    </Page>
  );
}
