import { redirect } from 'next/navigation';
import { ActivityDetails, VisibilityForm } from '../../../../components/buddy-profile';
import { Card, LinkButton, Muted, Page } from '../../../../components/ui';
import { apiForUser } from '../../../../lib/api';
import { getSessionUser } from '../../../../lib/supabase/server';
import { saveActivityDetails, saveVisibility } from '../buddy/actions';

export const metadata = { title: 'Complete your profile' };

/**
 * The profile-completion moment (Addendum 1.4 step 4): two screens, offered after a night and
 * from the dashboard, never on first run. Level and days free first, then the switches. The
 * second screen sets the "profile completed" mark; everything stays editable at /profile/buddy.
 */
export default async function CompleteProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ step?: string; back?: string }>;
}) {
  if (!(await getSessionUser())) redirect('/sign-in?next=/profile/complete');
  const { step: rawStep, back } = await searchParams;
  const profile = await apiForUser().profile.get();
  const step = rawStep === '2' ? 2 : 1;
  const home = back && back.startsWith('/') && !back.startsWith('//') ? back : '/dashboard';
  const query = back ? `&back=${encodeURIComponent(back)}` : '';

  if (!profile.activities.length) {
    return (
      <Page title="Complete your profile" back={home}>
        <Card>
          <Muted>Pick a sport first, then come back here.</Muted>
          <LinkButton href="/profile/buddy" className="mt-3 w-full">
            My buddy profile
          </LinkButton>
        </Card>
      </Page>
    );
  }

  if (step === 1)
    return (
      <Page
        title="How good, and when?"
        eyebrow="1 of 2"
        back={home}
        lead="Your own view of your level, and the days you're free for a game. Buddies see this; nobody is checking."
      >
        <Card>
          <ActivityDetails
            profile={profile}
            action={saveActivityDetails.bind(null, `/profile/complete?step=2${query}`)}
            submitLabel="Continue"
          />
        </Card>
      </Page>
    );

  return (
    <Page
      title="Who can find you?"
      eyebrow="2 of 2"
      back={`/profile/complete?step=1${query}`}
      lead="People you've played with can already see you. This is about everyone else."
    >
      <Card>
        <VisibilityForm
          profile={profile}
          action={saveVisibility.bind(null, `${home}${home.includes('?') ? '&' : '?'}completed=1`)}
          submitLabel="Done"
        />
      </Card>
    </Page>
  );
}
