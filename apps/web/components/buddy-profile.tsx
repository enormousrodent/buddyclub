import { activityKey, levelsFor, type MyProfile } from '@buddyclub/shared-types';
import { RALLY_SPORTS, rallySportName } from '../lib/sports';
import { ActionForm, type FormAction } from './action-form';
import { DayGrid } from './day-grid';
import { Field, Input, Muted, Select, Textarea } from './ui';

/*
 * Buddy profile sections (Addendum 1.3), used by the Buddy Club first run and the profile
 * editor. Each section is one form bound to one action; the caller decides where it goes next.
 * Activities are the six racket sports; levels and ladders come from the catalogue in shared-types.
 */

export function activityLabel(a: { activityName: string }): string {
  return a.activityName;
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
  action,
  submitLabel,
}: {
  profile: MyProfile;
  action: FormAction;
  submitLabel: string;
}) {
  // Racket sports only (Addendum 1.4): the same six chips as the first run.
  const chosen = new Set(profile.activities.map((a) => a.activityId));
  return (
    <ActionForm action={action} submitLabel={submitLabel} size="lg" resetOnSuccess={false}>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1.5 text-[13px] font-semibold">Your sports</legend>
        <div className="flex flex-wrap gap-2">
          {RALLY_SPORTS.map((id) => (
            <label
              key={id}
              className="inline-flex h-9 cursor-pointer items-center rounded-full border border-hairline-strong px-3.5 text-[13px] font-semibold has-checked:border-primary has-checked:bg-primary has-checked:text-primary-ink"
            >
              <input
                type="checkbox"
                name="activity"
                value={id}
                defaultChecked={chosen.has(id)}
                className="sr-only"
              />
              {rallySportName(id)}
            </label>
          ))}
        </div>
        <Muted className="text-xs">
          Pick at least one. Dropping a sport removes its level and days.
        </Muted>
      </fieldset>
    </ActionForm>
  );
}

/** The right control for an activity's ladder: options, a number, or nothing. */
function LevelControl({ activityId, value }: { activityId: string; value: string | null }) {
  const set = levelsFor(activityId);
  const name = `level:${activityId}`;
  if (set.kind === 'none') return null;
  if (set.kind === 'handicap')
    return (
      <Field label="Handicap" hint={`${set.min} to ${set.max}. Leave blank if you don't keep one.`}>
        <Input
          name={name}
          type="number"
          min={set.min}
          max={set.max}
          step={1}
          defaultValue={value ?? ''}
          inputMode="numeric"
        />
      </Field>
    );
  const hint =
    set.kind === 'pick'
      ? 'Your own view. Nobody is checking.'
      : set.kind === 'certification'
        ? 'The highest you hold.'
        : 'Where you are comfortable.';
  const label =
    set.kind === 'pick' ? 'Your level' : set.kind === 'certification' ? 'Certification' : 'Grade';
  return (
    <Field label={label} hint={hint}>
      <Select name={name} defaultValue={value ?? ''}>
        <option value="">Not sure yet</option>
        {set.kind === 'pick'
          ? set.options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
                {o.hint ? ` · ${o.hint}` : ''}
              </option>
            ))
          : set.options.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
      </Select>
    </Field>
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
          <section key={a.id} className="rounded-card border border-hairline p-4">
            <h3 className="font-display text-[22px] font-bold leading-tight">
              {activityLabel(a)}
              {a.customName ? (
                <span className="ml-2 align-middle text-[12px] font-semibold text-muted">
                  suggested
                </span>
              ) : null}
            </h3>
            <div className="mt-3 space-y-3">
              <LevelControl activityId={key} value={a.level} />
              <div>
                <div className="mb-1.5 text-[13px] font-semibold">When you&apos;re free for it</div>
                <DayGrid name={`days:${a.id}`} initial={a.days} />
              </div>
              <Field
                label="Anything to add"
                hint="Optional. Who you'd like to play with, what you're after."
              >
                <Textarea
                  name={`note:${a.id}`}
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
  const label = new Map(profile.activities.map((a) => [a.activityId, activityLabel(a)]));
  const name = (g: { activityId: string }) => label.get(g.activityId) ?? g.activityId;
  const forGear = profile.activities.filter((a) => a.activityId !== 'other');
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
      {forGear.length ? (
        <ActionForm action={add} submitLabel="Add to my gear" variant="secondary">
          <Field label="For">
            <Select name="activity" defaultValue={forGear[0]!.activityId}>
              {forGear.map((a) => (
                <option key={a.activityId} value={a.activityId}>
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
