import { redirect } from 'next/navigation';
import {
  AboutForm,
  ActivityDetails,
  ActivityPicker,
  GearEditor,
  VisibilityForm,
} from '../../../components/buddy-profile';
import { Card, Page, SectionHeading } from '../../../components/ui';
import { apiForUser, apiPublic } from '../../../lib/api';
import { getSessionUser } from '../../../lib/supabase/server';
import {
  addGear,
  removeGear,
  saveAbout,
  saveActivities,
  saveActivityDetails,
  saveVisibility,
} from '../welcome/actions';

export const metadata = { title: 'My buddy profile' };

/** Everything from the first run, editable in one place (Addendum 1.3). */
export default async function BuddyProfilePage() {
  if (!(await getSessionUser())) redirect('/sign-in?next=/buddy');
  const api = apiForUser();
  const [profile, interests, sports] = await Promise.all([
    api.profile.get(),
    apiPublic().community.interests(),
    apiPublic().sports(),
  ]);
  return (
    <Page
      title="My buddy profile"
      lead="What you're into, how good you reckon you are, when you're free, and your gear."
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
          interests={interests.items}
          sports={sports.items}
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
