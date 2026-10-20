import { roleAllows } from '@buddyclub/auth';
import { redirect } from 'next/navigation';
import { ActionForm } from '../../../../../components/action-form';
import { Badge, Card, Empty, Field, List, Page, Row, Select } from '../../../../../components/ui';
import { apiForUser } from '../../../../../lib/api';
import { getSessionUser } from '../../../../../lib/supabase/server';
import { addToRoster, removeFromRoster } from '../../actions';

export const metadata = { title: 'Team' };

export default async function TeamPage({ params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await params;
  if (!(await getSessionUser()))
    redirect(`/sign-in?next=${encodeURIComponent(`/league/teams/${teamId}`)}`);
  const api = apiForUser();
  const team = await api.teams.get(teamId);
  const [org, participants] = await Promise.all([
    api.organisations.get(team.organisationId),
    api.participants.list(team.organisationId),
  ]);
  const canManage = org.myRole ? roleAllows(org.myRole, 'competition.manage') : false;
  const onTeam = new Set(team.roster.map((r) => r.participantId));
  const candidates = participants.items.filter((p) => !onTeam.has(p.id));

  return (
    <Page title={team.name} back="/league">
      {team.roster.length ? (
        <List>
          {team.roster.map((r) => (
            <Row
              key={r.participantId}
              title={r.displayName}
              right={
                <div className="flex items-center gap-3">
                  {r.isCaptain ? <Badge>captain</Badge> : null}
                  {canManage ? (
                    <form action={removeFromRoster.bind(null, teamId, r.participantId)}>
                      <button type="submit" className="text-sm text-danger">
                        Remove
                      </button>
                    </form>
                  ) : null}
                </div>
              }
            />
          ))}
        </List>
      ) : (
        <Empty>No players on this team yet.</Empty>
      )}
      {canManage && candidates.length ? (
        <Card className="mt-3">
          <ActionForm action={addToRoster.bind(null, teamId)} submitLabel="Add to team">
            <Field label="Player">
              <Select name="participantId">
                {candidates.map((p) => (
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
