import { roleAllows } from '@buddyclub/auth';
import { redirect } from 'next/navigation';
import { ActionForm } from '../../../../../components/action-form';
import {
  Card,
  Empty,
  Field,
  Input,
  List,
  Page,
  Row,
  Select,
  StateBadge,
} from '../../../../../components/ui';
import { apiForUser } from '../../../../../lib/api';
import { getSessionUser } from '../../../../../lib/supabase/server';
import { createSeason } from '../../actions';

export const metadata = { title: 'Competition' };

function iso(d: Date) {
  return d.toISOString().slice(0, 10);
}

export default async function CompetitionPage({
  params,
}: {
  params: Promise<{ competitionId: string }>;
}) {
  const { competitionId } = await params;
  if (!(await getSessionUser()))
    redirect(`/sign-in?next=${encodeURIComponent(`/league/competitions/${competitionId}`)}`);
  const api = apiForUser();
  const comp = await api.competitions.get(competitionId);
  const org = await api.organisations.get(comp.organisationId);
  const canManage = org.myRole ? roleAllows(org.myRole, 'competition.manage') : false;

  return (
    <Page title={comp.name} back="/league">
      {comp.seasons.length ? (
        <List>
          {comp.seasons.map((s) => (
            <Row
              key={s.id}
              href={`/league/seasons/${s.id}`}
              title={s.name}
              subtitle={`${s.divisions.length} divisions · ${new Date(s.startsAt).toLocaleDateString()} to ${new Date(s.endsAt).toLocaleDateString()}`}
              right={<StateBadge state={s.state} />}
            />
          ))}
        </List>
      ) : (
        <Empty>No seasons yet.</Empty>
      )}
      {canManage ? (
        <Card className="mt-4">
          <ActionForm action={createSeason.bind(null, competitionId)} submitLabel="Create season">
            <Field label="Season name">
              <Input name="name" placeholder="2026/27" required maxLength={160} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Starts">
                <Input name="startsAt" type="date" defaultValue={iso(new Date())} required />
              </Field>
              <Field label="Ends">
                <Input
                  name="endsAt"
                  type="date"
                  defaultValue={iso(new Date(Date.now() + 180 * 86400000))}
                  required
                />
              </Field>
            </div>
            <Field label="Divisions" hint="Four teams each; Division 1 is the highest.">
              <Input
                name="divisions"
                type="number"
                min={1}
                max={16}
                defaultValue={3}
                inputMode="numeric"
              />
            </Field>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Game to">
                <Input
                  name="targetPoints"
                  type="number"
                  min={1}
                  defaultValue={21}
                  inputMode="numeric"
                />
              </Field>
              <Field label="Win by">
                <Input name="winBy" type="number" min={1} defaultValue={1} inputMode="numeric" />
              </Field>
              <Field label="Cap (blank = none)">
                <Input name="cap" type="number" min={1} inputMode="numeric" />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Games per rubber">
                <Input
                  name="setsPerRubber"
                  type="number"
                  min={1}
                  max={5}
                  defaultValue={1}
                  inputMode="numeric"
                />
              </Field>
              <Field label="If a fixture is 2-2">
                <Select name="tieBreak" defaultValue="needs_review">
                  <option value="needs_review">Director reviews</option>
                  <option value="aggregate_points">Aggregate points</option>
                  <option value="draw_allowed">Draw</option>
                  <option value="decider">Decider rubber</option>
                </Select>
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Promote per meet">
                <Input
                  name="promoteCount"
                  type="number"
                  min={0}
                  defaultValue={1}
                  inputMode="numeric"
                />
              </Field>
              <Field label="Relegate per meet">
                <Input
                  name="relegateCount"
                  type="number"
                  min={0}
                  defaultValue={1}
                  inputMode="numeric"
                />
              </Field>
            </div>
          </ActionForm>
        </Card>
      ) : null}
    </Page>
  );
}
