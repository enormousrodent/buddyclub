import { redirect } from 'next/navigation';
import {
  AboutForm,
  ActivityDetails,
  ActivityPicker,
  GearEditor,
  VisibilityForm,
} from '../../../../components/buddy-profile';
import { Card, Page, SectionHeading } from '../../../../components/ui';
import { apiForUser } from '../../../../lib/api';
import { getSessionUser } from '../../../../lib/supabase/server';
import {
  addGear,
  removeGear,
  saveAbout,
  saveActivities,
  saveActivityDetails,
  saveVisibility,
} from './actions';

export const metadata = { title: 'My buddy profile' };

/**
 * The buddy profile, editable in one place (Addendum 1.3, re-homed by 1.4). Every account is a
 * Buddy Club member; this is what the membership holds. Find me and Show my gear stay off until
 * the person switches them on.
 */
export default async function BuddyProfilePage() {
  if (!(await getSessionUser())) redirect('/sign-in?next=/profile/buddy');
  const profile = await apiForUser().profile.get();
  return (
    <Page
      title="My buddy profile"
      lead="What you play, how good you reckon you are, when you're free, and your gear."
      back="/profile"
    >
      <SectionHeading>About you</SectionHeading>
      <Card>
        <AboutForm profile={profile} action={saveAbout.bind(null, null)} submitLabel="Save" />
      </Card>

      <SectionHeading>Activities</SectionHeading>
      <Card>
        <ActivityPicker
          profile={profile}
          action={saveActivities.bind(null, null)}
          submitLabel="Save activities"
        />
      </Card>

      <SectionHeading>Level and days</SectionHeading>
      <Card>
        <ActivityDetails
          profile={profile}
          action={saveActivityDetails.bind(null, null)}
          submitLabel="Save"
        />
      </Card>

      <SectionHeading>Gear</SectionHeading>
      <Card>
        <GearEditor profile={profile} add={addGear.bind(null, null)} remove={removeGear} />
      </Card>

      <SectionHeading>Who can find you</SectionHeading>
      <Card>
        <VisibilityForm
          profile={profile}
          action={saveVisibility.bind(null, null)}
          submitLabel="Save"
        />
      </Card>
    </Page>
  );
}
