import Link from 'next/link';
import {
  Button,
  Card,
  Empty,
  Icon,
  Input,
  List,
  Muted,
  Page,
  Row,
  Select,
} from '../../../../components/ui';
import { apiForUser, apiPublic } from '../../../../lib/api';
import { describeSchedule, whenIn } from '../../../../lib/sessions';
import { RALLY_SPORTS, rallySportName } from '../../../../lib/sports';
import { getSessionUser } from '../../../../lib/supabase/server';
import { askToJoin, joinSession } from './actions';

export const metadata = { title: 'Near you' };

/**
 * Near you (Addendum 1.5): public sessions by place and sport. An open one can be joined on the
 * spot; an invitation-only one says so. The session is the group, so there is nothing else to
 * discover.
 */
export default async function NearYouPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; locality?: string; sport?: string; asked?: string }>;
}) {
  const { q, locality, sport: rawSport, asked } = await searchParams;
  const sport = RALLY_SPORTS.find((s) => s === rawSport) ?? '';
  const [user, result] = await Promise.all([
    getSessionUser(),
    apiPublic().sessions.public({
      ...(q ? { q } : {}),
      ...(locality ? { locality } : {}),
      ...(sport ? { sport } : {}),
    }),
  ]);
  const [me, requests] = user
    ? await Promise.all([apiForUser().me(), apiForUser().joinRequests.mine()])
    : [null, { items: [] }];
  const pendingFor = new Set(
    requests.items.filter((r) => r.status === 'pending').map((r) => r.organisationId),
  );
  const myOrgs = new Set(
    (me?.memberships ?? []).filter((m) => m.status === 'active').map((m) => m.organisationId),
  );

  return (
    <Page
      title="Near you"
      back="/sessions"
      lead="Public sessions by place and sport. Join an open one, or ask to join."
    >
      {asked ? (
        <Card className="mb-4 border-live">
          <div className="font-display text-[20px] font-bold uppercase leading-none">Asked.</div>
          <Muted className="mt-1 block">
            The organisers will see your request, your sports and your level. Once they say yes, the
            session appears on your home.
          </Muted>
        </Card>
      ) : null}
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
                    pendingFor.has(s.organisationId) ? (
                      <span className="text-[12px] font-semibold text-muted">Asked</span>
                    ) : user ? (
                      <form action={askToJoin.bind(null, s.id)}>
                        <Button type="submit" size="sm" variant="secondary">
                          Ask to join
                        </Button>
                      </form>
                    ) : (
                      <Link
                        href={`/sign-in?next=${encodeURIComponent('/explore')}`}
                        className="text-[13px] font-bold text-primary"
                      >
                        Sign in to ask
                      </Link>
                    )
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
