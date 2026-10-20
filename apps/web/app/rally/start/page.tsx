import { roleAllows } from '@buddyclub/auth';
import { redirect } from 'next/navigation';
import { ActionForm } from '../../../components/action-form';
import {
  Button,
  Card,
  Field,
  Icon,
  Input,
  List,
  Muted,
  Page,
  Row,
  Select,
} from '../../../components/ui';
import { apiForUser } from '../../../lib/api';
import { getSessionUser } from '../../../lib/supabase/server';
import { createSessionWithOccurrence } from '../../shared/sessions/actions';
import { startOnMyOwn } from '../actions';

export const metadata = { title: 'Start session' };

function localDefault(): string {
  const d = new Date(Date.now() + 30 * 60 * 1000);
  d.setMinutes(0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:00`;
}

/**
 * Rally's "Start session" flow. Works with no club: "Just me" creates a personal workspace
 * (ADR-017). Uses the same server action as the club sessions page, so a session started here
 * is a normal occurrence.
 */
export default async function StartSessionPage({
  searchParams,
}: {
  searchParams: Promise<{ club?: string }>;
}) {
  if (!(await getSessionUser())) redirect('/sign-in?next=/start');
  const { club } = await searchParams;
  const api = apiForUser();
  const me = await api.me();
  const places = me.memberships.filter(
    (m) => m.status === 'active' && roleAllows(m.role, 'session.manage'),
  );
  const personal = places.find((m) => m.organisationKind === 'personal');
  const clubs = places.filter((m) => m.organisationKind === 'club');
  const chosen =
    places.find((m) => m.organisationId === club) ??
    (clubs.length === 0 && personal
      ? personal
      : clubs.length === 1 && !personal
        ? clubs[0]
        : undefined);

  if (!chosen) {
    return (
      <Page title="Start a session" back="/" lead="Where is this session running?">
        {clubs.length ? (
          <List>
            {clubs.map((m) => (
              <Row
                key={m.organisationId}
                href={`/start?club=${m.organisationId}`}
                title={m.organisationName}
                subtitle={m.role.replace(/_/g, ' ')}
              />
            ))}
          </List>
        ) : null}
        <Card className="mt-3 space-y-3">
          <div className="flex items-start gap-3">
            <Icon name="user" size={22} className="mt-0.5 shrink-0 text-primary" />
            <div>
              <div className="font-semibold">Just me</div>
              <Muted>
                Run a session on your own, no club or members. Your presets and history stay in your
                personal workspace.
              </Muted>
            </div>
          </div>
          {personal ? (
            <form action={startOnMyOwn}>
              <Button
                type="submit"
                size="lg"
                className="w-full"
                variant={clubs.length ? 'secondary' : 'primary'}
              >
                Continue on my own
              </Button>
            </form>
          ) : (
            <form action={startOnMyOwn}>
              <Button
                type="submit"
                size="lg"
                className="w-full"
                variant={clubs.length ? 'secondary' : 'primary'}
              >
                Start on my own
              </Button>
            </form>
          )}
        </Card>
      </Page>
    );
  }

  const [venues, sports] = await Promise.all([
    api.venues.list(chosen.organisationId),
    api.sports(),
  ]);

  return (
    <Page
      title="Start a session"
      back={places.length > 1 ? '/start' : '/'}
      eyebrow={chosen.organisationKind === 'personal' ? 'Just me' : chosen.organisationName}
      lead="Set the courts and round length. Players check in once it's open."
    >
      <Card>
        <ActionForm
          action={createSessionWithOccurrence.bind(null, chosen.organisationId)}
          submitLabel="Create session"
        >
          <Field label="Name" hint="Saved as a preset you can start again with one tap.">
            <Input name="name" placeholder="Tuesday Social" required maxLength={160} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Sport">
              <Select name="sportId" defaultValue="badminton">
                {sports.items.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Venue">
              <Select name="venueId" defaultValue={venues.items[0]?.id ?? ''}>
                <option value="">No venue yet</option>
                {venues.items.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Starts">
            <Input name="startsAt" type="datetime-local" defaultValue={localDefault()} required />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Round length (min)">
              <Input
                name="roundMinutes"
                type="number"
                min={3}
                max={120}
                defaultValue={12}
                inputMode="numeric"
              />
            </Field>
            <Field label="Session length (min)">
              <Input
                name="durationMinutes"
                type="number"
                min={15}
                max={720}
                defaultValue={120}
                inputMode="numeric"
              />
            </Field>
          </div>
        </ActionForm>
      </Card>
      <p className="mt-3 text-center text-xs text-muted">
        {venues.items.length
          ? 'Courts come from the venue.'
          : chosen.organisationKind === 'personal'
            ? 'No venue yet: add one with its courts from the club page in Buddy Club, or carry on and set courts later.'
            : "No venue yet: add one under the club's Venues tab."}
      </p>
    </Page>
  );
}
