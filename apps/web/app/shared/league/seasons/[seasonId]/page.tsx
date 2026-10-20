import { roleAllows } from '@buddyclub/auth';
import { redirect } from 'next/navigation';
import { ActionForm } from '../../../../../components/action-form';
import {
  Card,
  Empty,
  Field,
  Input,
  List,
  Muted,
  Page,
  Row,
  SectionHeading,
  Select,
  StateBadge,
} from '../../../../../components/ui';
import { apiForUser } from '../../../../../lib/api';
import { getSessionUser } from '../../../../../lib/supabase/server';
import { createMeet, createTeam } from '../../actions';

export const metadata = { title: 'Season' };

function localDefault(days: number): string {
  const d = new Date(Date.now() + days * 86400000);
  d.setMinutes(0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T10:00`;
}

export default async function SeasonPage({ params }: { params: Promise<{ seasonId: string }> }) {
  const { seasonId } = await params;
  if (!(await getSessionUser()))
    redirect(`/sign-in?next=${encodeURIComponent(`/league/seasons/${seasonId}`)}`);
  const api = apiForUser();
  const season = await api.competitions.getSeason(seasonId);
  const [org, meets, teams, venues, participants] = await Promise.all([
    api.organisations.get(season.organisationId),
    api.meets.list(seasonId),
    api.teams.list(season.organisationId),
    api.venues.list(season.organisationId),
    api.participants.list(season.organisationId),
  ]);
  const canManage = org.myRole ? roleAllows(org.myRole, 'competition.manage') : false;
  const scoring = (season.rules['scoring'] ?? {}) as {
    targetPoints?: number;
    winBy?: number;
    cap?: number | null;
  };

  return (
    <Page title={season.name} back={`/league/competitions/${season.competitionId}`}>
      <Card className="mb-4">
        <Muted>
          {season.competitionName} · {season.divisions.map((d) => d.name).join(', ')} · games to{' '}
          {scoring.targetPoints ?? 21}
          {scoring.winBy && scoring.winBy > 1 ? `, win by ${scoring.winBy}` : ''}
          {scoring.cap ? `, cap ${scoring.cap}` : ''}
        </Muted>
      </Card>

      <SectionHeading>Meets</SectionHeading>
      {meets.items.length ? (
        <List>
          {meets.items.map((m) => (
            <Row
              key={m.id}
              href={`/league/meets/${m.id}`}
              title={`${m.sequenceNo}. ${m.name}`}
              subtitle={`${new Date(m.startsAt).toLocaleString()} · ${m.venueName ?? 'no venue'} · ${m.counts.completedFixtures}/${m.counts.fixtures} fixtures done`}
              right={<StateBadge state={m.state} />}
            />
          ))}
        </List>
      ) : (
        <Empty>No meets yet.</Empty>
      )}
      {canManage ? (
        <Card className="mt-3">
          <ActionForm action={createMeet.bind(null, seasonId)} submitLabel="Create meet">
            <Field label="Meet name">
              <Input
                name="name"
                placeholder={`Meet ${meets.items.length + 1}`}
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
              <Field label="Venue">
                <Select name="venueId" defaultValue={venues.items[0]?.id ?? ''}>
                  <option value="">No venue</option>
                  {venues.items.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          </ActionForm>
        </Card>
      ) : null}

      <SectionHeading>Teams</SectionHeading>
      {teams.items.length ? (
        <List>
          {teams.items.map((t) => (
            <Row
              key={t.id}
              href={`/league/teams/${t.id}`}
              title={t.name}
              subtitle={`${t.rosterCount} players`}
            />
          ))}
        </List>
      ) : (
        <Empty>No teams yet.</Empty>
      )}
      {canManage ? (
        <Card className="mt-3">
          <ActionForm
            action={createTeam.bind(null, season.organisationId, seasonId)}
            submitLabel="Create team"
          >
            <Field label="Team name">
              <Input name="name" placeholder="New Forest" required maxLength={120} />
            </Field>
            <Field label="Captain (optional)">
              <Select name="captainParticipantId" defaultValue="">
                <option value="">No captain yet</option>
                {participants.items.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.displayName}
                  </option>
                ))}
              </Select>
            </Field>
          </ActionForm>
        </Card>
      ) : null}
    </Page>
  );
}
