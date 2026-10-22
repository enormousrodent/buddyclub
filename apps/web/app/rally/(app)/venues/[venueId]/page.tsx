import { roleAllows } from '@buddyclub/auth';
import { redirect } from 'next/navigation';
import { ActionForm } from '../../../../../components/action-form';
import {
  Badge,
  Card,
  Empty,
  Field,
  Input,
  List,
  Muted,
  Page,
  Row,
} from '../../../../../components/ui';
import { apiForUser } from '../../../../../lib/api';
import { getSessionUser } from '../../../../../lib/supabase/server';
import { createCourt, toggleCourt } from '../../clubs/actions';

export const metadata = { title: 'Venue' };

export default async function VenuePage({ params }: { params: Promise<{ venueId: string }> }) {
  const { venueId } = await params;
  if (!(await getSessionUser()))
    redirect(`/sign-in?next=${encodeURIComponent(`/venues/${venueId}`)}`);
  const api = apiForUser();
  const venue = await api.venues.get(venueId);
  const org = await api.organisations.get(venue.organisationId);
  const canManage = org.myRole ? roleAllows(org.myRole, 'facilities.manage') : false;

  return (
    <Page title={venue.name} back={`/clubs/${venue.organisationId}/venues`}>
      <Card className="mb-4">
        <Muted>
          {[venue.address.line1, venue.address.town, venue.address.postcode]
            .filter(Boolean)
            .join(', ') || 'No address'}{' '}
          · {venue.timezone}
        </Muted>
      </Card>

      {canManage ? (
        <Card className="mb-4">
          <ActionForm action={createCourt.bind(null, venueId)} submitLabel="Add court">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Court code" hint="Short, e.g. 1 or A">
                <Input name="code" maxLength={16} required />
              </Field>
              <Field label="Label (optional)">
                <Input name="label" maxLength={80} />
              </Field>
            </div>
          </ActionForm>
        </Card>
      ) : null}

      {venue.courts.length === 0 ? (
        <Empty>No courts yet.</Empty>
      ) : (
        <List>
          {venue.courts.map((c) => (
            <Row
              key={c.id}
              title={`Court ${c.code}`}
              subtitle={c.label ?? undefined}
              right={
                <div className="flex items-center gap-3">
                  <Badge>{c.active ? 'active' : 'inactive'}</Badge>
                  {canManage ? (
                    <form action={toggleCourt.bind(null, venueId, c.id, !c.active)}>
                      <button type="submit" className="text-sm text-primary">
                        {c.active ? 'Deactivate' : 'Activate'}
                      </button>
                    </form>
                  ) : null}
                </div>
              }
            />
          ))}
        </List>
      )}
    </Page>
  );
}
