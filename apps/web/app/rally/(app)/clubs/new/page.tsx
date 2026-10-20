import { redirect } from 'next/navigation';
import { ActionForm } from '../../../../../components/action-form';
import { Card, Field, Input, Muted, Page } from '../../../../../components/ui';
import { getSessionUser } from '../../../../../lib/supabase/server';
import { createRallyClub } from './actions';

export const metadata = { title: 'New club' };

/**
 * New club (first-run flow): the place your players sign up to. One form, then straight into the
 * preset builder for that club.
 */
export default async function NewClubPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  if (!(await getSessionUser())) redirect('/sign-in?next=/clubs/new');
  const fromWelcome = (await searchParams).from === 'welcome';

  return (
    <Page
      title="Your club"
      back={fromWelcome ? '/welcome?step=3' : '/start'}
      lead="Players join it with one link and see their court on their own phone. Your presets and regulars live inside it."
    >
      <Card>
        <ActionForm
          action={createRallyClub.bind(null, fromWelcome)}
          submitLabel="Create club"
          size="lg"
        >
          <Field label="Club name" hint="How players will see it. You can rename it later.">
            <Input
              name="name"
              placeholder="Thursday Pickleball"
              required
              maxLength={160}
              autoComplete="organization"
            />
          </Field>
          <Field label="Where you play" hint="Optional. Courts come from the venue.">
            <Input name="venueName" placeholder="Riverside Leisure Centre" maxLength={160} />
          </Field>
          <Field label="Courts">
            <Input
              name="courts"
              type="number"
              min={1}
              max={20}
              defaultValue={4}
              inputMode="numeric"
            />
          </Field>
        </ActionForm>
      </Card>
      <Muted className="mt-3 block text-center text-xs">
        Just you running the night with walk-ins? Skip this and pick &ldquo;Just me&rdquo; when you
        start a session.
      </Muted>
    </Page>
  );
}
