import { redirect } from 'next/navigation';
import {
  AboutForm,
  ActivityDetails,
  ActivityPicker,
  GearEditor,
  VisibilityForm,
} from '../../../components/buddy-profile';
import { Card, LinkButton, Muted, Page } from '../../../components/ui';
import { apiForUser } from '../../../lib/api';
import { getSessionUser } from '../../../lib/supabase/server';
import {
  addGear,
  removeGear,
  saveAbout,
  saveActivities,
  saveActivityDetails,
  saveVisibility,
} from '../../shared/profile/buddy/actions';

export const metadata = { title: 'Welcome' };

const STEPS = [
  { title: 'Who you are', lead: 'A name, your area, and a line if you like.' },
  { title: "What you're into", lead: 'Pick at least one. You can change them any time.' },
  { title: 'How good, and when', lead: 'Your own view of your level, and the days you are free.' },
  { title: 'Your gear', lead: 'Optional. Useful to buddies, and a bit of showing off.' },
  { title: 'Who can find you', lead: 'Everything is off until you switch it on.' },
] as const;

/**
 * Buddy Club first run (Addendum 1.3): five screens, independent of Rally's. Every Buddy Club
 * page sends a signed-in person here until they finish; at least one activity is required.
 */
export default async function WelcomePage({
  searchParams,
}: {
  searchParams: Promise<{ step?: string }>;
}) {
  if (!(await getSessionUser())) redirect('/sign-in?next=/welcome');
  const { step: raw } = await searchParams;
  const step = Math.min(5, Math.max(1, Number(raw) || 1));
  const profile = await apiForUser().profile.get();
  const meta = STEPS[step - 1]!;
  const next = (n: number) => `/welcome?step=${n}`;

  return (
    <Page
      eyebrow={`Step ${step} of 5`}
      title={meta.title}
      lead={meta.lead}
      {...(step > 1 ? { back: next(step - 1) } : {})}
    >
      <Card>
        {step === 1 ? (
          <AboutForm
            profile={profile}
            action={saveAbout.bind(null, next(2))}
            submitLabel="Continue"
          />
        ) : null}
        {step === 2 ? (
          <ActivityPicker
            profile={profile}
            action={saveActivities.bind(null, next(3))}
            submitLabel="Continue"
          />
        ) : null}
        {step === 3 ? (
          <ActivityDetails
            profile={profile}
            action={saveActivityDetails.bind(null, next(4))}
            submitLabel="Continue"
          />
        ) : null}
        {step === 4 ? (
          <div className="space-y-4">
            <GearEditor profile={profile} add={addGear.bind(null, null)} remove={removeGear} />
            <LinkButton href={next(5)} size="lg" className="w-full">
              {profile.gear.length ? 'Continue' : 'Nothing to add, continue'}
            </LinkButton>
          </div>
        ) : null}
        {step === 5 ? (
          <VisibilityForm
            profile={profile}
            action={saveVisibility.bind(null, '/?welcome=done')}
            submitLabel="Finish"
          />
        ) : null}
      </Card>
      {step === 1 ? (
        <Muted className="mt-3 block text-center text-xs">
          Rally has its own quick set-up for running sessions. This one is about you.
        </Muted>
      ) : null}
    </Page>
  );
}
