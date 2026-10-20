import { roleAllows } from '@buddyclub/auth';
import { ActionForm } from '../../../../../components/action-form';
import { Card, Empty, Field, Input, List, Page, Row, Select } from '../../../../../components/ui';
import { apiForUser } from '../../../../../lib/api';
import { createGroup } from '../../actions';
import { ClubNav } from '../club-nav';

export const metadata = { title: 'Groups' };

export default async function GroupsPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const api = apiForUser();
  const [org, groups, sports] = await Promise.all([
    api.organisations.get(orgId),
    api.groups.list(orgId),
    api.sports(),
  ]);
  const canManage = org.myRole ? roleAllows(org.myRole, 'groups.manage') : false;

  return (
    <Page title={org.name} back="/">
      <ClubNav orgId={orgId} current="groups" />
      {canManage ? (
        <Card className="mb-4">
          <ActionForm action={createGroup.bind(null, orgId)} submitLabel="Create group">
            <Field label="Group name">
              <Input name="name" placeholder="Tuesday Social" maxLength={160} required />
            </Field>
            <Field label="Sport">
              <Select name="sportId" defaultValue="badminton">
                {sports.items.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Description (optional)">
              <Input name="description" maxLength={2000} />
            </Field>
          </ActionForm>
        </Card>
      ) : null}
      {groups.items.length === 0 ? (
        <Empty>
          No groups yet. A group is a set of players who play together, like a weekly social.
        </Empty>
      ) : (
        <List>
          {groups.items.map((g) => (
            <Row
              key={g.id}
              href={`/groups/${g.id}`}
              title={g.name}
              subtitle={`${g.sportId} · ${g.memberCount} players`}
            />
          ))}
        </List>
      )}
    </Page>
  );
}
