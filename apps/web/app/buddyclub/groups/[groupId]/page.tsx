import { ApiError } from '@buddyclub/api-client';
import { ActionForm } from '../../../../components/action-form';
import { whenShort } from '../../../../components/discover';
import {
  Badge,
  Button,
  Card,
  Empty,
  Field,
  Icon,
  Input,
  LinkButton,
  List,
  Muted,
  Page,
  Row,
  SectionHeading,
  Select,
  StateBadge,
  Textarea,
} from '../../../../components/ui';
import { apiForUser, apiPublic } from '../../../../lib/api';
import { getSessionUser } from '../../../../lib/supabase/server';
import { createActivity, joinGroup } from '../../community-actions';

export const metadata = { title: 'Group' };

function localDefault(days: number): string {
  const d = new Date(Date.now() + days * 86400000);
  d.setMinutes(0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T10:00`;
}

/** Public group page: cover, interests, upcoming gatherings, join. Organisers add gatherings. */
export default async function GroupPage({ params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = await params;
  const user = await getSessionUser();
  const api = user ? apiForUser() : apiPublic();
  let page;
  try {
    page = await api.community.group(groupId);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404)
      return (
        <Page title="Group not found" back="/">
          <Empty>This group is private or no longer exists.</Empty>
        </Page>
      );
    throw error;
  }
  const { group, activities, myRole } = page;
  const organiser = myRole === 'organiser';
  const [occurrences, interests] = organiser
    ? await Promise.all([
        apiForUser().occurrences.list(group.organisationId),
        apiPublic().community.interests(),
      ])
    : [null, null];
  const linkable =
    occurrences?.items.filter((o) => o.state === 'draft' || o.state === 'open') ?? [];

  return (
    <Page
      title={group.name}
      eyebrow={group.interests.map((i) => i.name).join(' · ') || 'Community'}
      back="/"
      lead={group.description ?? undefined}
      action={group.visibility === 'private' ? <Badge>private</Badge> : undefined}
    >
      <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted">
        <span className="inline-flex items-center gap-1">
          <Icon name="users" size={14} />
          {group.memberCount} member{group.memberCount === 1 ? '' : 's'}
        </span>
        {group.locality ? (
          <span className="inline-flex items-center gap-1">
            <Icon name="pin" size={14} />
            {group.locality}
            {group.locationName ? ` · ${group.locationName}` : ''}
          </span>
        ) : null}
        <span>run by {group.organisationName}</span>
      </div>

      {!myRole ? (
        <Card className="mb-4 space-y-3">
          {user ? (
            group.joinPolicy === 'open' ? (
              <form action={joinGroup.bind(null, groupId)}>
                <Button type="submit" size="lg" className="w-full">
                  Join group
                </Button>
              </form>
            ) : (
              <Muted>This group is by invitation. Ask an organiser for a link.</Muted>
            )
          ) : (
            <LinkButton
              href={`/sign-in?next=${encodeURIComponent(`/groups/${groupId}`)}`}
              size="lg"
              className="w-full"
            >
              Sign in to join
            </LinkButton>
          )}
        </Card>
      ) : (
        <div className="mb-4">
          <Badge tone="success">
            {myRole === 'organiser' ? 'You organise this group' : "You're a member"}
          </Badge>
        </div>
      )}

      <SectionHeading>Upcoming</SectionHeading>
      {activities.filter((a) => a.state === 'scheduled').length ? (
        <List>
          {activities
            .filter((a) => a.state === 'scheduled')
            .map((a) => (
              <Row
                key={a.id}
                href={`/activities/${a.id}`}
                leading={
                  <span className="flex w-12 flex-col items-center">
                    <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-primary">
                      {new Date(a.startsAt).toLocaleDateString('en-GB', { weekday: 'short' })}
                    </span>
                    <span className="font-display text-2xl font-extrabold leading-7">
                      {new Date(a.startsAt).getDate()}
                    </span>
                  </span>
                }
                title={a.title}
                subtitle={`${whenShort(a.startsAt)} · ${a.goingCount} going${a.rally ? ' · Powered by Rally' : ''}`}
                right={
                  a.myRsvp || a.rally?.myAttendance ? (
                    <StateBadge state={a.rally?.myAttendance ?? (a.myRsvp as string)} />
                  ) : undefined
                }
              />
            ))}
        </List>
      ) : (
        <Empty>Nothing scheduled yet.</Empty>
      )}

      {organiser ? (
        <>
          <SectionHeading>Add a gathering</SectionHeading>
          <Card>
            <ActionForm action={createActivity.bind(null, groupId)} submitLabel="Add gathering">
              <Field label="Title">
                <Input
                  name="title"
                  placeholder="Saturday loop with the dogs"
                  required
                  maxLength={160}
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Starts">
                  <Input
                    name="startsAt"
                    type="datetime-local"
                    defaultValue={localDefault(7)}
                    required
                  />
                </Field>
                <Field label="Ends (optional)">
                  <Input name="endsAt" type="datetime-local" />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Where">
                  <Input
                    name="locationName"
                    defaultValue={group.locationName ?? ''}
                    maxLength={200}
                  />
                </Field>
                <Field label="Spaces (optional)">
                  <Input name="capacity" type="number" min={1} max={10000} inputMode="numeric" />
                </Field>
              </div>
              <Field label="Category">
                <Select name="interestId" defaultValue={group.interests[0]?.id ?? ''}>
                  <option value="">Same as the group</option>
                  {interests?.items.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name}
                    </option>
                  ))}
                </Select>
              </Field>
              {linkable.length ? (
                <Field
                  label="Run it with Rally"
                  hint="Attendance then lives in the Rally session; RSVPs register players there."
                >
                  <Select name="rallyOccurrenceId" defaultValue="">
                    <option value="">Not a Rally session</option>
                    {linkable.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.seriesName} · {whenShort(o.startsAt)}
                      </option>
                    ))}
                  </Select>
                </Field>
              ) : null}
              <Field label="Details">
                <Textarea name="description" rows={3} maxLength={4000} />
              </Field>
            </ActionForm>
          </Card>
          <Muted className="mt-3 block">
            Members and walk-ins are managed in the club:{' '}
            <a
              href={`/clubs/${group.organisationId}/groups`}
              className="font-semibold text-primary"
            >
              {group.organisationName}
            </a>
            .
          </Muted>
        </>
      ) : null}
    </Page>
  );
}
