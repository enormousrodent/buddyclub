import { roleAllows } from '@buddyclub/auth';
import { ActionForm } from '../../../../../components/action-form';
import { Badge, Card, Empty, Field, Input, List, Page, Row } from '../../../../../components/ui';
import { apiForUser } from '../../../../../lib/api';
import { addGuest } from '../../actions';
import { ClubNav } from '../club-nav';

export const metadata = { title: 'Players' };

export default async function PlayersPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const api = apiForUser();
  const [org, participants] = await Promise.all([
    api.organisations.get(orgId),
    api.participants.list(orgId),
  ]);
  const canManage = org.myRole ? roleAllows(org.myRole, 'participants.manage') : false;

  return (
    <Page title={org.name} back="/">
      <ClubNav orgId={orgId} current="players" />
      {canManage ? (
        <Card className="mb-4">
          <ActionForm action={addGuest.bind(null, orgId)} submitLabel="Add player">
            <Field
              label="Name"
              hint="Walk-ins need nothing else. They can be linked to an account later."
            >
              <Input name="displayName" placeholder="Sam" maxLength={120} required />
            </Field>
            <Field
              label="Skill rating (optional)"
              hint="0 to 100; used only for balancing rotations."
            >
              <Input
                name="skillRating"
                type="number"
                min={0}
                max={100}
                step={0.5}
                inputMode="decimal"
              />
            </Field>
          </ActionForm>
        </Card>
      ) : null}
      {participants.items.length === 0 ? (
        <Empty>No players yet.</Empty>
      ) : (
        <List>
          {participants.items.map((p) => (
            <Row
              key={p.id}
              href={canManage ? `/clubs/${orgId}/players/${p.id}` : undefined}
              title={p.displayName}
              subtitle={p.skillRating !== null ? `Skill ${p.skillRating}` : undefined}
              right={<Badge>{p.source === 'guest' ? 'guest' : 'member'}</Badge>}
            />
          ))}
        </List>
      )}
    </Page>
  );
}
