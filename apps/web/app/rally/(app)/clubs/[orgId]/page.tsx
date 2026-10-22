import { roleAllows } from '@buddyclub/auth';
import { ActionForm } from '../../../../../components/action-form';
import {
  Card,
  Empty,
  Field,
  Input,
  LinkButton,
  List,
  Muted,
  Page,
  Row,
  SectionHeading,
  Stat,
  StateBadge,
} from '../../../../../components/ui';
import { apiForUser } from '../../../../../lib/api';
import { describeSchedule, whenIn } from '../../../../../lib/sessions';
import { renameClub } from '../actions';
import { ClubNav } from './club-nav';

const RECENT = 8;

/**
 * The club (Addendum 1.5): its sessions, with Configure for organisers, what is coming up and
 * what has been played. Members, players and venues have their own tabs.
 */
export default async function ClubOverviewPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const api = apiForUser();
  const [org, members, participants, seriesList, occurrences, venues] = await Promise.all([
    api.organisations.get(orgId),
    api.organisations.members(orgId),
    api.participants.list(orgId),
    api.sessions.list(orgId),
    api.occurrences.list(orgId),
    api.venues.list(orgId),
  ]);
  const canManage = org.myRole ? roleAllows(org.myRole, 'organisation.manage') : false;
  const canRun = org.myRole ? roleAllows(org.myRole, 'session.manage') : false;
  const sessions = seriesList.items.filter((s) => !s.archivedAt);
  const done = (state: string) => state === 'completed' || state === 'cancelled';
  const upcoming = occurrences.items
    .filter((o) => !done(o.state))
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const recent = occurrences.items
    .filter((o) => done(o.state))
    .sort((a, b) => b.startsAt.localeCompare(a.startsAt))
    .slice(0, RECENT);

  return (
    <Page title={org.name} back="/dashboard">
      <ClubNav orgId={orgId} current="overview" />
      <div className="grid grid-cols-2 gap-3">
        <Stat label="Sessions" value={sessions.length} />
        <Stat label="Members" value={members.items.length} />
        <Stat label="Players" value={participants.items.length} />
        <Stat label="Venues" value={venues.items.length} />
      </div>

      <SectionHeading
        action={
          canRun ? (
            <LinkButton href={`/start?club=${orgId}&new=1`} size="sm" variant="secondary">
              New session
            </LinkButton>
          ) : undefined
        }
      >
        Sessions
      </SectionHeading>
      {sessions.length ? (
        <List>
          {sessions.map((s) => (
            <Row
              key={s.id}
              href={`/sessions/${s.id}`}
              title={s.name}
              subtitle={[
                s.schedule ? describeSchedule(s.schedule) : 'No weekly schedule',
                s.nextAt ? `next ${whenIn(s.nextAt)}` : null,
                s.visibility === 'public'
                  ? s.joinPolicy === 'open'
                    ? 'Public, open to join'
                    : 'Public, by invitation'
                  : 'Private',
              ]
                .filter(Boolean)
                .join(' · ')}
              right={
                canRun ? (
                  <span className="text-[13px] font-semibold text-primary">Configure</span>
                ) : undefined
              }
            />
          ))}
        </List>
      ) : (
        <Empty title="No sessions yet">
          {canRun
            ? 'A session is a regular night: its courts, timings, regulars and hosts.'
            : 'Nothing set up here yet.'}
        </Empty>
      )}

      {upcoming.length ? (
        <>
          <SectionHeading>Coming up</SectionHeading>
          <List>
            {upcoming.map((o) => (
              <Row
                key={o.id}
                href={`/sessions/${o.id}`}
                title={o.seriesName}
                subtitle={`${whenIn(o.startsAt)}${o.venueName ? ` · ${o.venueName}` : ''} · ${o.counts.entries} in`}
                right={<StateBadge state={o.state} />}
              />
            ))}
          </List>
        </>
      ) : null}

      <SectionHeading
        action={
          <LinkButton href={`/clubs/${orgId}/sessions`} size="sm" variant="ghost">
            All nights
          </LinkButton>
        }
      >
        Played
      </SectionHeading>
      {recent.length ? (
        <List>
          {recent.map((o) => (
            <Row
              key={o.id}
              href={`/sessions/${o.id}`}
              title={o.seriesName}
              subtitle={`${whenIn(o.startsAt)}${o.venueName ? ` · ${o.venueName}` : ''} · ${o.counts.checkedIn} played`}
              right={<StateBadge state={o.state} />}
            />
          ))}
        </List>
      ) : (
        <Empty>Nothing played yet.</Empty>
      )}

      <Card className="mt-4">
        <Muted>
          Your role: <strong>{org.myRole?.replace('_', ' ')}</strong> · short name{' '}
          <code>{org.slug}</code>
        </Muted>
      </Card>
      {canManage ? (
        <Card className="mt-4">
          <ActionForm
            action={renameClub.bind(null, orgId, org.version)}
            submitLabel="Rename"
            resetOnSuccess={false}
          >
            <Field label="Club name">
              <Input name="name" defaultValue={org.name} maxLength={160} required />
            </Field>
          </ActionForm>
        </Card>
      ) : null}
    </Page>
  );
}
