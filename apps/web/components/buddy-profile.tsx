import {
  ACTIVITY_LEVELS,
  activityKey,
  type Interest,
  type MyProfile,
  type Sport,
} from '@buddyclub/shared-types';
import { ActionForm, type FormAction } from './action-form';
import { DayGrid } from './day-grid';
import { Field, Input, Muted, Select, Textarea } from './ui';

/*
 * Buddy profile sections (Addendum 1.3), used by the Buddy Club first run and the profile
 * editor. Each section is one form bound to one action; the caller decides where it goes next.
 */

/** Every pickable activity: interests, with racket sports expanded into the sports themselves. */
export function activityChoices(interests: Interest[], sports: Sport[]) {
  const out: { key: string; label: string; group: 'sports' | 'everything' }[] = [];
  for (const i of interests) {
    if (i.id === 'other') continue;
    if (i.id === 'racket_sports') {
      for (const s of sports)
        out.push({ key: `racket_sports:${s.id}`, label: s.name, group: 'sports' });
      continue;
    }
    out.push({ key: i.id, label: i.name, group: i.id === 'sports' ? 'sports' : 'everything' });
  }
  return out;
}

export function activityLabel(a: { interestName: string; sportName: string | null }): string {
  return a.sportName ?? a.interestName;
}

export function AboutForm({
  profile,
  action,
  submitLabel,
}: {
  profile: MyProfile;
  action: FormAction;
  submitLabel: string;
}) {
  return (
    <ActionForm action={action} submitLabel={submitLabel} size="lg" resetOnSuccess={false}>
      <Field label="Your name" hint="What buddies and groups see.">
        <Input name="displayName" defaultValue={profile.displayName} maxLength={120} required />
      </Field>
      <Field label="Where you are" hint="A town or area, like Winchester. Never an address.">
        <Input
          name="locality"
          defaultValue={profile.locality ?? ''}
          maxLength={80}
          placeholder="Winchester"
        />
      </Field>
      <Field label="A line about you" hint="Optional. 160 characters.">
        <Input
          name="bio"
          defaultValue={profile.bio ?? ''}
          maxLength={160}
          placeholder="Weeknight pickleball, weekend walks, always up for a game."
        />
      </Field>
    </ActionForm>
  );
}

export function ActivityPicker({
  profile,
  interests,
  sports,
  action,
  submitLabel,
}: {
  profile: MyProfile;
  interests: Interest[];
  sports: Sport[];
  action: FormAction;
  submitLabel: string;
}) {
  const picked = new Set(profile.activities.map(activityKey));
  const choices = activityChoices(interests, sports);
  const group = (name: 'sports' | 'everything', title: string) => (
    <div>
      <div className="mb-2 text-[13px] font-bold uppercase tracking-[0.06em] text-muted">
        {title}
      </div>
      <div className="flex flex-wrap gap-2">
        {choices
          .filter((c) => c.group === name)
          .map((c) => (
            <label key={c.key} className="cursor-pointer">
              <input
                type="checkbox"
                name="activity"
                value={c.key}
                defaultChecked={picked.has(c.key)}
                className="peer sr-only"
              />
              <span className="inline-flex min-h-10 items-center rounded-full border border-hairline-strong px-3.5 text-[14px] font-semibold text-ink peer-checked:border-primary peer-checked:bg-primary peer-checked:text-primary-ink peer-focus-visible:ring-2 peer-focus-visible:ring-primary">
                {c.label}
              </span>
            </label>
          ))}
      </div>
    </div>
  );
  return (
    <ActionForm action={action} submitLabel={submitLabel} size="lg" resetOnSuccess={false}>
      {group('sports', 'Sports')}
      {group('everything', 'Everything else')}
    </ActionForm>
  );
}

export function ActivityDetails({
  profile,
  action,
  submitLabel,
}: {
  profile: MyProfile;
  action: FormAction;
  submitLabel: string;
}) {
  if (!profile.activities.length) return <Muted>Pick an activity first and it appears here.</Muted>;
  return (
    <ActionForm action={action} submitLabel={submitLabel} size="lg" resetOnSuccess={false}>
      {profile.activities.map((a) => {
        const key = activityKey(a);
        return (
          <section key={key} className="rounded-card border border-hairline p-4">
            <h3 className="font-display text-[22px] font-bold leading-tight">{activityLabel(a)}</h3>
            <div className="mt-3 space-y-3">
              <Field label="Your level" hint="Your own view. Nobody is checking.">
                <Select name={`level:${key}`} defaultValue={a.level ?? ''}>
                  <option value="">Not sure yet</option>
                  {ACTIVITY_LEVELS.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.label} · {l.hint}
                    </option>
                  ))}
                </Select>
              </Field>
              <div>
                <div className="mb-1.5 text-[13px] font-semibold">When you&apos;re free for it</div>
                <DayGrid name={`days:${key}`} initial={a.days} />
              </div>
              <Field
                label="Anything to add"
                hint="Optional. Who you'd like to play with, what you're after."
              >
                <Textarea
                  name={`note:${key}`}
                  defaultValue={a.note ?? ''}
                  maxLength={160}
                  rows={2}
                />
              </Field>
            </div>
          </section>
        );
      })}
    </ActionForm>
  );
}

export function GearEditor({
  profile,
  add,
  remove,
}: {
  profile: MyProfile;
  add: FormAction;
  remove: (gearId: string) => Promise<void>;
}) {
  const label = new Map(profile.activities.map((a) => [activityKey(a), activityLabel(a)]));
  const name = (g: { interestId: string; sportId: string | null }) =>
    label.get(activityKey(g)) ?? g.sportId ?? g.interestId;
  return (
    <div className="space-y-4">
      {profile.gear.length ? (
        <ul className="divide-y divide-hairline rounded-card border border-hairline bg-surface">
          {profile.gear.map((g) => (
            <li key={g.id} className="flex min-h-14 items-center justify-between gap-3 px-4 py-2">
              <span className="min-w-0">
                <span className="block truncate text-[15px] font-semibold">{g.name}</span>
                <span className="block truncate text-[13px] text-muted">
                  {name(g)}
                  {g.detail ? ` · ${g.detail}` : ''}
                </span>
              </span>
              <form action={remove.bind(null, g.id)}>
                <button type="submit" className="text-[13px] font-semibold text-danger">
                  Remove
                </button>
              </form>
            </li>
          ))}
        </ul>
      ) : (
        <Muted>Nothing on the shelf yet.</Muted>
      )}
      {profile.activities.length ? (
        <ActionForm action={add} submitLabel="Add to my gear" variant="secondary">
          <Field label="For">
            <Select name="activity" defaultValue={activityKey(profile.activities[0]!)}>
              {profile.activities.map((a) => (
                <option key={activityKey(a)} value={activityKey(a)}>
                  {activityLabel(a)}
                </option>
              ))}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="What">
              <Input name="name" maxLength={80} placeholder="Babolat Pure Drive" required />
            </Field>
            <Field label="Detail">
              <Input name="detail" maxLength={120} placeholder="2023, 300g" />
            </Field>
          </div>
        </ActionForm>
      ) : (
        <Muted>Pick an activity first, then add the gear you use for it.</Muted>
      )}
    </div>
  );
}

export function VisibilityForm({
  profile,
  action,
  submitLabel,
}: {
  profile: MyProfile;
  action: FormAction;
  submitLabel: string;
}) {
  const row = (name: string, title: string, hint: string, checked: boolean) => (
    <label className="flex min-h-12 items-start justify-between gap-3 rounded-control bg-surface-2 px-3.5 py-3 text-sm">
      <span>
        <span className="block font-semibold">{title}</span>
        <span className="block text-xs text-muted">{hint}</span>
      </span>
      <input type="checkbox" name={name} defaultChecked={checked} className="mt-0.5 h-5 w-5" />
    </label>
  );
  return (
    <ActionForm action={action} submitLabel={submitLabel} size="lg" resetOnSuccess={false}>
      {row(
        'discoverable',
        'Find me',
        'Other signed-in buddies can find you by activity and area. Off, you are only seen by people in your groups and at gatherings you attend.',
        profile.discoverable,
      )}
      {row(
        'adult',
        "I'm 18 or over",
        'Needed for Find me. Buddy search is for adults only.',
        profile.adultConfirmed,
      )}
      {row(
        'showGear',
        'Show my gear',
        'Let people who can see your profile see the shelf.',
        profile.showGear,
      )}
      <Muted className="text-xs">
        Nothing here is on until you say so, and you can change it any time from your profile. Where
        you are is only ever the area you typed.
      </Muted>
    </ActionForm>
  );
}
