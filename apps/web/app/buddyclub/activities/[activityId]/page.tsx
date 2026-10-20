import { ApiError } from '@buddyclub/api-client';
import Link from 'next/link';
import { RallyMark } from '../../../../components/brand';
import { whenShort } from '../../../../components/discover';
import {
  Alert,
  Badge,
  Button,
  Card,
  Empty,
  Icon,
  LinkButton,
  Muted,
  Page,
  StateBadge,
} from '../../../../components/ui';
import { apiForUser, apiPublic } from '../../../../lib/api';
import { getSessionUser } from '../../../../lib/supabase/server';
import { cancelActivity, rsvp } from '../../community-actions';

export const metadata = { title: 'Activity' };

export default async function ActivityPage({
  params,
}: {
  params: Promise<{ activityId: string }>;
}) {
  const { activityId } = await params;
  const user = await getSessionUser();
  const api = user ? apiForUser() : apiPublic();
  let a;
  try {
    a = await api.community.activity(activityId);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404)
      return (
        <Page title="Not found" back="/">
          <Empty>This gathering is private or no longer exists.</Empty>
        </Page>
      );
    throw error;
  }
  const me = user ? await apiForUser().me() : null;
  const myRole = me?.memberships.find((m) => m.organisationId === a.organisationId)?.role;
  const organiser =
    !!myRole &&
    ['org_admin', 'platform_admin', 'session_organiser', 'competition_director'].includes(myRole);
  const full = !!a.capacity && a.goingCount >= a.capacity && a.myRsvp !== 'going';
  const rallyHref = a.rally
    ? a.rally.publicSlug
      ? `/join/${a.rally.publicSlug}`
      : `/sessions/${a.rally.occurrenceId}/me`
    : null;

  return (
    <Page
      title={a.title}
      eyebrow={a.groupName}
      back={`/groups/${a.groupId}`}
      action={a.state !== 'scheduled' ? <StateBadge state={a.state} /> : undefined}
    >
      <Card className="mb-4 divide-y divide-hairline p-0">
        <div className="flex items-center gap-3 px-4 py-3">
          <Icon name="calendar" size={22} className="text-primary" />
          <div className="flex-1">
            <div className="font-semibold">{whenShort(a.startsAt)}</div>
            <Muted>
              until{' '}
              {new Date(a.endsAt).toLocaleTimeString('en-GB', {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </Muted>
          </div>
        </div>
        {a.locationName || a.venueName ? (
          <div className="flex items-center gap-3 px-4 py-3">
            <Icon name="pin" size={22} className="text-primary" />
            <div className="flex-1">
              <div className="font-semibold">{a.venueName ?? a.locationName}</div>
              {a.venueName && a.locationName ? <Muted>{a.locationName}</Muted> : null}
            </div>
          </div>
        ) : null}
        <div className="flex items-center gap-3 px-4 py-3">
          <Icon name="users" size={22} className="text-primary" />
          <div className="flex-1">
            <div className="font-semibold">
              {a.goingCount} going{a.maybeCount ? `, ${a.maybeCount} maybe` : ''}
              {a.capacity ? ` · ${Math.max(0, a.capacity - a.goingCount)} spaces left` : ''}
            </div>
            {a.interest ? <Muted>{a.interest.name}</Muted> : null}
          </div>
        </div>
      </Card>

      {a.description ? (
        <p className="mb-4 text-[15px] leading-6 text-ink-2">{a.description}</p>
      ) : null}

      {a.rally ? (
        <Card className="mb-4 flex items-center gap-3" tone="well">
          <RallyMark size={28} color="var(--bc-brand-rally)" />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-bold">Powered by Rally</div>
            <Muted>
              Courts, rotations and the timer run in Rally.
              {a.rally.myAttendance ? ` You're ${a.rally.myAttendance.replace('_', ' ')}.` : ''}
            </Muted>
          </div>
          {rallyHref ? (
            <Link
              href={rallyHref}
              className="inline-flex min-h-9 items-center rounded-full bg-ink px-3.5 text-xs font-bold text-on-ink"
            >
              Open in Rally
            </Link>
          ) : null}
        </Card>
      ) : null}

      {a.state === 'scheduled' ? (
        user ? (
          <div className="space-y-2">
            {full ? (
              <Alert tone="warning">
                This gathering is full. Choose maybe to be told if a place opens.
              </Alert>
            ) : null}
            <div className="flex gap-2">
              <form action={rsvp.bind(null, activityId, 'going')} className="flex-1">
                <Button
                  type="submit"
                  size="lg"
                  className="w-full"
                  variant={a.myRsvp === 'going' ? 'tonal' : 'primary'}
                  disabled={full}
                >
                  <Icon name="check" size={18} />
                  {a.myRsvp === 'going' ? "You're going" : "I'm going"}
                </Button>
              </form>
              <form action={rsvp.bind(null, activityId, 'maybe')}>
                <Button
                  type="submit"
                  size="lg"
                  variant={a.myRsvp === 'maybe' ? 'tonal' : 'secondary'}
                >
                  Maybe
                </Button>
              </form>
            </div>
            {a.myRsvp && a.myRsvp !== 'not_going' ? (
              <form action={rsvp.bind(null, activityId, 'not_going')}>
                <Button type="submit" variant="ghost" size="sm">
                  Can&apos;t make it
                </Button>
              </form>
            ) : null}
            <Muted className="block text-center">
              Your name is shared with the organiser only.
            </Muted>
          </div>
        ) : (
          <LinkButton
            href={`/sign-in?next=${encodeURIComponent(`/activities/${activityId}`)}`}
            size="lg"
            className="w-full"
          >
            Sign in to say you&apos;re going
          </LinkButton>
        )
      ) : (
        <Badge tone={a.state === 'cancelled' ? 'danger' : 'neutral'}>{a.state}</Badge>
      )}

      {organiser && a.state === 'scheduled' ? (
        <form action={cancelActivity.bind(null, activityId)} className="mt-6">
          <Button type="submit" variant="danger" size="sm">
            Cancel this gathering
          </Button>
        </form>
      ) : null}
    </Page>
  );
}
