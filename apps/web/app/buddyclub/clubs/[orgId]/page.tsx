import { roleAllows } from '@buddyclub/auth';
import { ActionForm } from '../../../../components/action-form';
import { Card, Field, Input, Muted, Page, Stat } from '../../../../components/ui';
import { apiForUser } from '../../../../lib/api';
import { renameClub } from '../actions';
import { ClubNav } from './club-nav';

export default async function ClubOverviewPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const api = apiForUser();
  const [org, members, participants, groups, venues] = await Promise.all([
    api.organisations.get(orgId),
    api.organisations.members(orgId),
    api.participants.list(orgId),
    api.groups.list(orgId),
    api.venues.list(orgId),
  ]);
  const canManage = org.myRole ? roleAllows(org.myRole, 'organisation.manage') : false;

  return (
    <Page title={org.name} back="/">
      <ClubNav orgId={orgId} current="overview" />
      <div className="grid grid-cols-2 gap-3">
        <Stat label="Members" value={members.items.length} />
        <Stat label="Players" value={participants.items.length} />
        <Stat label="Groups" value={groups.items.length} />
        <Stat label="Venues" value={venues.items.length} />
      </div>
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
