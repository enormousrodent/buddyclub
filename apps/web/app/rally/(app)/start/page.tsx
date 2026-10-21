import { roleAllows } from '@buddyclub/auth';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ActionForm } from '../../../../components/action-form';
import { SessionCard } from '../../../../components/session-card';
import { Kicker } from '../../../../components/rally-kit';
import { Card, Field, Icon, Input, LinkButton, Page, Select } from '../../../../components/ui';
import { apiForUser } from '../../../../lib/api';
import { getSessionUser } from '../../../../lib/supabase/server';
import { setUpSession } from '../../../shared/sessions/actions';
import { startOnMyOwn } from '../../actions';

export const metadata = { title: 'Start a session' };

/**
 * Start a session (designs B2 and B3). Your sessions first, one tap each; then the builder for
 * a new one. From onboarding (`from=welcome`) the builder saves the session without starting it.
 */
export default async function StartSessionPage({
  searchParams,
}: {
  searchParams: Promise<{ club?: string; new?: string; from?: string }>;
}) {
  if (!(await getSessionUser())) redirect('/sign-in?next=/start');
  const { club, new: forceNew, from } = await searchParams;
  const fromWelcome = from === 'welcome';
  const api = apiForUser();
  const [me, presets] = await Promise.all([api.me(), api.sessions.presets()]);
  const places = me.memberships.filter(
    (m) => m.status === 'active' && roleAllows(m.role, 'session.manage'),
  );
  const personal = places.find((m) => m.organisationKind === 'personal');
  const clubs = places.filter((m) => m.organisationKind === 'club');
  const chosen = places.find((m) => m.organisationId === club) ?? personal ?? clubs[0] ?? undefined;
  const showPresets = presets.items.length > 0 && !forceNew;

  const [venues, sports] = chosen
    ? await Promise.all([api.venues.list(chosen.organisationId), api.sports()])
    : [{ items: [] }, { items: [] }];

  return (
    <Page
      title={fromWelcome ? 'Set up your usual night.' : 'Start a session'}
      back={fromWelcome ? '/welcome?step=3' : '/dashboard'}
      action={
        showPresets ? (
          <LinkButton href="/start?new=1" size="sm" variant="secondary">
            <Icon name="plus" size={14} />
            New session
          </LinkButton>
        ) : undefined
      }
      lead={
        fromWelcome
          ? 'Saved as a session you run every week. Change anything on the night.'
          : showPresets
            ? 'Pick a session or build tonight from scratch.'
            : 'Set the courts and round length. Players check in once it is open.'
      }
    >
      {showPresets ? (
        <>
          <Kicker className="mb-2">Your sessions</Kicker>
          <div className="mb-6 flex flex-col gap-3">
            {presets.items.map((p) => (
              <SessionCard key={p.seriesId} p={p} />
            ))}
          </div>
          <Kicker className="mb-2">Or set up a new one</Kicker>
        </>
      ) : null}

      <div className="mb-3">
        <div className="mb-1.5 text-[13px] font-semibold">Where</div>
        <div className="scroll-row -mx-5 flex gap-2 px-5 pb-1 sm:mx-0 sm:px-0">
          {clubs.map((m) => (
            <Link
              key={m.organisationId}
              href={`/start?club=${m.organisationId}${forceNew ? '&new=1' : ''}${fromWelcome ? '&from=welcome' : ''}`}
              className={`inline-flex h-9 shrink-0 items-center rounded-full border px-3.5 text-[13px] font-semibold ${
                chosen?.organisationId === m.organisationId
                  ? 'border-primary bg-primary text-primary-ink'
                  : 'border-hairline-strong text-ink'
              }`}
            >
              {m.organisationName}
            </Link>
          ))}
          {personal ? (
            <Link
              href={`/start?club=${personal.organisationId}${forceNew ? '&new=1' : ''}${fromWelcome ? '&from=welcome' : ''}`}
              className={`inline-flex h-9 shrink-0 items-center rounded-full border px-3.5 text-[13px] font-semibold ${
                chosen?.organisationId === personal.organisationId
                  ? 'border-primary bg-primary text-primary-ink'
                  : 'border-hairline-strong text-ink'
              }`}
            >
              Just me
            </Link>
          ) : (
            <form action={startOnMyOwn}>
              <button
                type="submit"
                className="inline-flex h-9 shrink-0 items-center rounded-full border border-hairline-strong px-3.5 text-[13px] font-semibold text-ink"
              >
                Just me
              </button>
            </form>
          )}
          <Link
            href={`/clubs/new${fromWelcome ? '?from=welcome' : ''}`}
            className="inline-flex h-9 shrink-0 items-center gap-1 rounded-full border border-dashed border-hairline-strong px-3.5 text-[13px] font-semibold text-primary"
          >
            <Icon name="plus" size={14} />
            New club
          </Link>
        </div>
      </div>

      {chosen ? (
        <Card>
          <ActionForm
            action={setUpSession.bind(null, chosen.organisationId, fromWelcome)}
            submitLabel="Save session"
            size="lg"
          >
            <Field label="Session name">
              <Input
                name="name"
                placeholder={
                  chosen.organisationKind === 'personal'
                    ? 'Tuesday pickleball'
                    : `${chosen.organisationName} club night`
                }
                required
                maxLength={160}
              />
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
            <label className="flex min-h-11 items-center justify-between gap-3 rounded-control bg-surface-2 px-3.5 text-sm">
              <span>
                <span className="block font-semibold">Also start a night now</span>
                <span className="block text-xs text-muted">
                  For a one-off tonight. Scheduled nights are set up from Tonight and upcoming.
                </span>
              </span>
              <input type="checkbox" name="startNow" defaultChecked={false} className="h-5 w-5" />
            </label>
          </ActionForm>
        </Card>
      ) : null}
      <p className="mt-3 text-center text-xs text-muted">
        {venues.items.length
          ? 'Courts come from the venue.'
          : 'No venue yet: carry on and set courts on the session, or add a venue in the club.'}
      </p>
    </Page>
  );
}
