import { redirect } from 'next/navigation';
import { ActionForm } from '../../../../components/action-form';
import { Card, Field, Input, Page } from '../../../../components/ui';
import { getSessionUser } from '../../../../lib/supabase/server';
import { createClub } from '../actions';

export const metadata = { title: 'New club' };

export default async function NewClubPage() {
  if (!(await getSessionUser())) redirect('/sign-in?next=/clubs/new');
  return (
    <Page title="New club" back="/">
      <Card>
        <ActionForm action={createClub} submitLabel="Create club">
          <Field label="Club name">
            <Input name="name" placeholder="New Forest Badminton Club" maxLength={160} required />
          </Field>
          <Field label="Short name (URL)" hint="Optional. Lower-case letters, digits and hyphens.">
            <Input
              name="slug"
              placeholder="new-forest-badminton"
              pattern="[a-z0-9][a-z0-9-]{1,61}[a-z0-9]"
            />
          </Field>
        </ActionForm>
      </Card>
    </Page>
  );
}
