import { roleAllows } from '@buddyclub/auth';
import { ActionForm } from '../../../../../components/action-form';
import { Card, Empty, Field, Input, List, Page, Row } from '../../../../../components/ui';
import { apiForUser } from '../../../../../lib/api';
import { createVenue } from '../../actions';
import { ClubNav } from '../club-nav';

export const metadata = { title: 'Venues' };

export default async function VenuesPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const api = apiForUser();
  const [org, venues] = await Promise.all([api.organisations.get(orgId), api.venues.list(orgId)]);
  const canManage = org.myRole ? roleAllows(org.myRole, 'facilities.manage') : false;

  return (
    <Page title={org.name} back="/">
      <ClubNav orgId={orgId} current="venues" />
      {canManage ? (
        <Card className="mb-4">
          <ActionForm action={createVenue.bind(null, orgId)} submitLabel="Add venue">
            <Field label="Venue name">
              <Input
                name="name"
                placeholder="Leisure Centre Sports Hall"
                maxLength={160}
                required
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Town">
                <Input name="town" maxLength={120} />
              </Field>
              <Field label="Postcode">
                <Input name="postcode" maxLength={20} />
              </Field>
            </div>
            <Field label="Timezone" hint="IANA name; UK venues use Europe/London.">
              <Input name="timezone" defaultValue="Europe/London" maxLength={64} />
            </Field>
          </ActionForm>
        </Card>
      ) : null}
      {venues.items.length === 0 ? (
        <Empty>No venues yet. Add the hall you play at and its courts.</Empty>
      ) : (
        <List>
          {venues.items.map((v) => (
            <Row
              key={v.id}
              href={`/venues/${v.id}`}
              title={v.name}
              subtitle={
                [v.address.town, v.address.postcode].filter(Boolean).join(' · ') || v.timezone
              }
            />
          ))}
        </List>
      )}
    </Page>
  );
}
