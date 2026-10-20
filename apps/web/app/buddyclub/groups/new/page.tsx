import { redirect } from 'next/navigation';
import { ActionForm } from '../../../../components/action-form';
import { Card, Field, Input, Muted, Page, Select, Textarea } from '../../../../components/ui';
import { apiForUser, apiPublic } from '../../../../lib/api';
import { getSessionUser } from '../../../../lib/supabase/server';
import { createCommunityGroup } from '../../community-actions';

export const metadata = { title: 'New group' };

export default async function NewGroupPage() {
  if (!(await getSessionUser())) redirect('/sign-in?next=/groups/new');
  const [interests, me, sports] = await Promise.all([
    apiPublic().community.interests(),
    apiForUser().me(),
    apiPublic().sports(),
  ]);
  const clubs = me.memberships.filter(
    (m) =>
      m.organisationKind === 'club' &&
      m.status === 'active' &&
      ['org_admin', 'platform_admin', 'session_organiser', 'competition_director'].includes(m.role),
  );
  return (
    <Page
      title="New group"
      back="/groups"
      lead="A book club, a dog walk, a toddler morning, a padel night. No sport required."
    >
      <Card>
        <ActionForm action={createCommunityGroup} submitLabel="Create group">
          <Field label="Name">
            <Input name="name" placeholder="Winchester Dog Walkers" required maxLength={160} />
          </Field>
          <Field label="What is it about?">
            <div className="grid grid-cols-2 gap-1 text-sm">
              {interests.items.map((i) => (
                <label key={i.id} className="flex min-h-10 items-center gap-2">
                  <input type="checkbox" name="interestIds" value={i.id} className="h-5 w-5" />
                  {i.name}
                </label>
              ))}
            </div>
          </Field>
          <Field label="Description">
            <Textarea
              name="description"
              rows={3}
              maxLength={2000}
              placeholder="Who it's for, when you meet, what to bring."
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Town or area">
              <Input name="locality" placeholder="Winchester" maxLength={120} />
            </Field>
            <Field label="Usual place">
              <Input name="locationName" placeholder="Garnier Road car park" maxLength={200} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Who can see it">
              <Select name="visibility" defaultValue="public">
                <option value="public">Public: anyone can find it</option>
                <option value="private">Private: members only</option>
              </Select>
            </Field>
            <Field label="Joining">
              <Select name="joinPolicy" defaultValue="open">
                <option value="open">Open: anyone can join</option>
                <option value="invite">By invitation</option>
              </Select>
            </Field>
          </div>
          {clubs.length ? (
            <Field
              label="Club"
              hint="Groups live inside a club. Leave blank to create a new one named after the group."
            >
              <Select name="organisationId" defaultValue="">
                <option value="">New club named after the group</option>
                {clubs.map((c) => (
                  <option key={c.organisationId} value={c.organisationId}>
                    {c.organisationName}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}
          <Field label="Racket sport (only if Rally will run the sessions)">
            <Select name="sportId" defaultValue="">
              <option value="">Not a racket-sport group</option>
              {sports.items.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
        </ActionForm>
      </Card>
      <Muted className="mt-3 block">
        You become the organiser. Public groups appear in Explore straight away.
      </Muted>
    </Page>
  );
}
