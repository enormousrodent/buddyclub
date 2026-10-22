import { DAY_SLOTS, levelsFor, WEEKDAY_KEYS } from '@buddyclub/shared-types';
import { redirect } from 'next/navigation';
import { BuddyRow } from '../../../../../components/buddy-row';
import {
  Button,
  Card,
  Empty,
  Field,
  Icon,
  Input,
  LinkButton,
  List,
  Muted,
  Page,
  Select,
} from '../../../../../components/ui';
import { apiForUser } from '../../../../../lib/api';
import { getSessionUser } from '../../../../../lib/supabase/server';
import { RALLY_SPORTS, rallySportName } from '../../../../../lib/sports';

export const metadata = { title: 'Find people' };

const DAY_NAMES: Record<string, string> = {
  mon: 'Monday',
  tue: 'Tuesday',
  wed: 'Wednesday',
  thu: 'Thursday',
  fri: 'Friday',
  sat: 'Saturday',
  sun: 'Sunday',
};

/**
 * Find me (Addendum 1.4 step 5): adults who switched it on, by sport, level, place and when they
 * are free. Only someone findable can look, so looking and being looked at go together.
 */
export default async function FindPeoplePage({
  searchParams,
}: {
  searchParams: Promise<{
    sport?: string;
    level?: string;
    locality?: string;
    day?: string;
    slot?: string;
  }>;
}) {
  if (!(await getSessionUser())) redirect('/sign-in?next=/buddies/find');
  const api = apiForUser();
  const profile = await api.profile.get();
  const q = await searchParams;
  const sport = RALLY_SPORTS.find((s) => s === q.sport) ?? '';
  const day = WEEKDAY_KEYS.find((d) => d === q.day) ?? '';
  const slot = DAY_SLOTS.find((s) => s === q.slot) ?? '';
  const ladder = levelsFor(sport || 'tennis');
  const levels = ladder.kind === 'pick' ? ladder.options : [];
  const level = levels.some((l) => l.id === q.level) ? (q.level as string) : '';
  const locality = (q.locality ?? '').trim().slice(0, 80);

  if (!profile.discoverable || !profile.adultConfirmed) {
    return (
      <Page title="Find people" back="/buddies">
        <Card>
          <div className="font-display text-[20px] font-bold uppercase leading-none">
            Switch Find me on first
          </div>
          <Muted className="mt-1 block">
            Finding people and being found go together. Find me is for adults, off by default, and
            only ever shows the area you typed, never an address.
          </Muted>
          <LinkButton href="/profile/buddy" className="mt-3 w-full">
            Find me settings
          </LinkButton>
        </Card>
      </Page>
    );
  }

  const searched = Boolean(sport || level || locality || day);
  const result = await api.buddies.search({
    ...(sport ? { sport } : {}),
    ...(level ? { level } : {}),
    ...(locality ? { locality } : {}),
    ...(day ? { day } : {}),
    ...(day && slot ? { slot } : {}),
  });

  return (
    <Page title="Find people" back="/buddies" lead="People who want to be found, near you.">
      <form method="get" action="/buddies/find" className="mb-4 flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Sport">
            <Select name="sport" defaultValue={sport}>
              <option value="">Any sport</option>
              {RALLY_SPORTS.map((s) => (
                <option key={s} value={s}>
                  {rallySportName(s)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Level">
            <Select name="level" defaultValue={level}>
              <option value="">Any level</option>
              {levels.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Free on">
            <Select name="day" defaultValue={day}>
              <option value="">Any day</option>
              {WEEKDAY_KEYS.map((d) => (
                <option key={d} value={d}>
                  {DAY_NAMES[d]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Time of day">
            <Select name="slot" defaultValue={slot}>
              <option value="">Any time</option>
              <option value="morning">Morning</option>
              <option value="afternoon">Afternoon</option>
              <option value="evening">Evening</option>
            </Select>
          </Field>
        </div>
        <div className="flex gap-2">
          <Input
            name="locality"
            defaultValue={locality}
            placeholder="Town or area"
            maxLength={80}
          />
          <Button type="submit" variant="secondary" aria-label="Search">
            <Icon name="search" size={18} />
          </Button>
        </div>
      </form>
      {result.items.length ? (
        <List>
          {result.items.map((b) => (
            <BuddyRow key={b.profileId} b={b} />
          ))}
        </List>
      ) : (
        <Empty title={searched ? 'Nobody matches yet' : 'Nobody findable yet'}>
          {searched
            ? 'Try a wider area or any level. People appear here as they switch Find me on.'
            : 'You are among the first. People appear here as they switch Find me on.'}
        </Empty>
      )}
    </Page>
  );
}
