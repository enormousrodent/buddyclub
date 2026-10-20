import { redirect } from 'next/navigation';
import { ActionForm } from '../../../components/action-form';
import {
  Card,
  Field,
  Input,
  List,
  Muted,
  Page,
  Row,
  SectionHeading,
  StateBadge,
} from '../../../components/ui';
import { apiForUser } from '../../../lib/api';
import { getSessionUser } from '../../../lib/supabase/server';
import { ThemeToggle } from '../../../components/theme-toggle';
import { readTheme } from '../../../lib/theme-server';
import { updateProfile } from './actions';

export const metadata = { title: 'Profile' };

export default async function ProfilePage() {
  if (!(await getSessionUser())) redirect('/sign-in?next=/profile');
  const [me, theme] = await Promise.all([apiForUser().me(), readTheme()]);
  return (
    <Page title="Profile" back="/">
      <Card>
        <ActionForm action={updateProfile} submitLabel="Save" resetOnSuccess={false}>
          <Field label="Display name" hint="Shown to other members and on court boards.">
            <Input
              name="displayName"
              defaultValue={me.profile.displayName}
              maxLength={120}
              required
            />
          </Field>
        </ActionForm>
      </Card>
      <SectionHeading>Appearance</SectionHeading>
      <Card>
        <ThemeToggle initial={theme} />
        <Muted className="mt-2 block">
          System follows your phone. Dark is the night-court theme for halls and evenings.
        </Muted>
      </Card>
      <SectionHeading>Memberships</SectionHeading>
      {me.memberships.length === 0 ? (
        <Muted>No clubs yet.</Muted>
      ) : (
        <List>
          {me.memberships.map((m) => (
            <Row
              key={m.organisationId}
              title={m.organisationName}
              subtitle={m.organisationSlug}
              right={<StateBadge state={m.role} />}
            />
          ))}
        </List>
      )}
    </Page>
  );
}
