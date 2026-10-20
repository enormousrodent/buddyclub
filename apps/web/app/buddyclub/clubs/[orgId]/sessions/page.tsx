import { roleAllows } from '@buddyclub/auth';
import { ActionForm } from '../../../../../components/action-form';
import {
  Card,
  Empty,
  Field,
  Input,
  List,
  Page,
  Row,
  SectionHeading,
  Select,
  StateBadge,
} from '../../../../../components/ui';
import { apiForUser } from '../../../../../lib/api';
import {
  createSessionWithOccurrence,
  scheduleOccurrence,
} from '../../../../shared/sessions/actions';
import { ClubNav } from '../club-nav';

export const metadata = { title: 'Sessions' };

function localDefault(): string {
  const d = new Date(Date.now() + 24 * 3600 * 1000);
  d.setMinutes(0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T19:00`;
}

export default async function SessionsPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const api = apiForUser();
  const [org, occurrences, seriesList, venues, sports] = await Promise.all([
    api.organisations.get(orgId),
    api.occurrences.list(orgId),
    api.sessions.list(orgId),
    api.venues.list(orgId),
    api.sports(),
  ]);
  const canManage = org.myRole ? roleAllows(org.myRole, 'session.manage') : false;

  return (
    <Page title={org.name} back="/">
      <ClubNav orgId={orgId} current="sessions" />
      {occurrences.items.length === 0 ? (
        <Empty>No sessions yet.</Empty>
      ) : (
        <List>
          {occurrences.items.map((o) => (
            <Row
              key={o.id}
              href={`/sessions/${o.id}`}
              title={o.seriesName}
              subtitle={`${new Date(o.startsAt).toLocaleString()} · ${o.venueName ?? 'no venue'} · ${o.counts.checkedIn}/${o.counts.entries} here`}
              right={<StateBadge state={o.state} />}
            />
          ))}
        </List>
      )}

      {canManage ? (
        <>
          <SectionHeading>New session</SectionHeading>
          <Card>
            <ActionForm
              action={createSessionWithOccurrence.bind(null, orgId)}
              submitLabel="Create and schedule"
            >
              <Field label="Name">
                <Input name="name" placeholder="Tuesday Social" required maxLength={160} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Sport">
                  <Select name="sportId" defaultValue="badminton">
                    {sports.items.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Venue">
                  <Select name="venueId" defaultValue={venues.items[0]?.id ?? ''}>
                    <option value="">No venue yet</option>
                    {venues.items.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
              <Field label="First session starts">
                <Input
                  name="startsAt"
                  type="datetime-local"
                  defaultValue={localDefault()}
                  required
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Round length (min)">
                  <Input
                    name="roundMinutes"
                    type="number"
                    min={3}
                    max={120}
                    defaultValue={12}
                    inputMode="numeric"
                  />
                </Field>
                <Field label="Session length (min)">
                  <Input
                    name="durationMinutes"
                    type="number"
                    min={15}
                    max={720}
                    defaultValue={120}
                    inputMode="numeric"
                  />
                </Field>
              </div>
            </ActionForm>
          </Card>
          {seriesList.items.length ? (
            <>
              <SectionHeading>Schedule another night</SectionHeading>
              <div className="space-y-3">
                {seriesList.items.map((s) => (
                  <Card key={s.id}>
                    <ActionForm
                      action={scheduleOccurrence.bind(null, s.id)}
                      submitLabel={`Schedule ${s.name}`}
                      variant="secondary"
                    >
                      <Field label="Starts">
                        <Input
                          name="startsAt"
                          type="datetime-local"
                          defaultValue={localDefault()}
                          required
                        />
                      </Field>
                    </ActionForm>
                  </Card>
                ))}
              </div>
            </>
          ) : null}
        </>
      ) : null}
    </Page>
  );
}
