import { cookies } from 'next/headers';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ActionForm } from '../../../../components/action-form';
import { Kicker } from '../../../../components/rally-kit';
import { Button, Card, Field, Icon, Input, LinkButton, Muted } from '../../../../components/ui';
import { apiForUser } from '../../../../lib/api';
import { getSessionUser } from '../../../../lib/supabase/server';
import { finishOnboarding, saveNameAndSports, saveRole } from './actions';
import { SPORTS_COOKIE } from './cookies';

export const metadata = { title: 'Welcome' };

const SPORTS = ['Pickleball', 'Badminton', 'Padel', 'Tennis', 'Squash', 'Table tennis'];

/** Onboarding (designs A4 to A6): name and sports, how you'll use Rally, your usual night. */
export default async function WelcomePage({
  searchParams,
}: {
  searchParams: Promise<{ step?: string }>;
}) {
  if (!(await getSessionUser())) redirect('/sign-in?next=/welcome');
  const step = Number((await searchParams).step ?? '1');
  const me = await apiForUser().me();
  const chosen = new Set(
    ((await cookies()).get(SPORTS_COOKIE)?.value ?? '').split(',').filter(Boolean),
  );

  return (
    <main className="mx-auto flex min-h-[calc(100dvh-3.5rem)] w-full max-w-xl flex-col px-5 pb-32 pt-4">
      <div className="mb-6 flex items-center gap-2">
        {step > 1 ? (
          <Link
            href={`/welcome?step=${step - 1}`}
            aria-label="Back a step"
            className="-ml-2 inline-flex h-10 w-10 items-center justify-center rounded-full text-ink hover:bg-surface-2"
          >
            <Icon name="back" size={22} />
          </Link>
        ) : null}
        <Kicker>{Math.min(Math.max(step, 1), 3)} of 3</Kicker>
      </div>

      {step <= 1 ? (
        <div className="flex flex-1 flex-col gap-4">
          <h1 className="font-display text-[40px] font-extrabold uppercase leading-[0.95]">
            What should we call you?
          </h1>
          <Muted className="block text-[15px] leading-6">
            Shown to other players and on court boards.
          </Muted>
          <ActionForm
            action={saveNameAndSports}
            submitLabel="Continue"
            size="lg"
            className="flex flex-1 flex-col gap-4"
          >
            <Field label="Display name">
              <Input
                name="displayName"
                defaultValue={me.profile.displayName}
                required
                maxLength={120}
                autoComplete="nickname"
              />
            </Field>
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1.5 text-[13px] font-semibold">Your sports</legend>
              <div className="flex flex-wrap gap-2">
                {SPORTS.map((s) => {
                  const id = s.toLowerCase().replace(/\s+/g, '_');
                  return (
                    <label
                      key={id}
                      className="inline-flex h-9 cursor-pointer items-center rounded-full border border-hairline-strong px-3.5 text-[13px] font-semibold has-checked:border-primary has-checked:bg-primary has-checked:text-primary-ink"
                    >
                      <input
                        type="checkbox"
                        name="sport"
                        value={id}
                        defaultChecked={chosen.has(id)}
                        className="sr-only"
                      />
                      {s}
                    </label>
                  );
                })}
              </div>
            </fieldset>
            <div className="flex-1" />
          </ActionForm>
        </div>
      ) : null}

      {step === 2 ? (
        <div className="flex flex-1 flex-col gap-4">
          <h1 className="font-display text-[40px] font-extrabold uppercase leading-[0.95]">
            How will you use Rally?
          </h1>
          <Muted className="block text-[15px] leading-6">
            You can do both. This just picks what you see first.
          </Muted>
          <form action={saveRole.bind(null, 'organiser')}>
            <button
              type="submit"
              className="flex w-full items-start gap-3 rounded-card border-2 border-primary bg-surface p-4 text-left"
            >
              <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-ink">
                <Icon name="play" size={20} />
              </span>
              <span>
                <span className="block font-display text-[24px] font-bold uppercase leading-none">
                  I run sessions
                </span>
                <span className="mt-1 block text-[13px] leading-5 text-ink-2">
                  Club nights, socials, league evenings. Courts, rotations and the timer from your
                  phone.
                </span>
              </span>
            </button>
          </form>
          <form action={saveRole.bind(null, 'player')}>
            <button
              type="submit"
              className="flex w-full items-start gap-3 rounded-card border border-hairline bg-surface p-4 text-left"
            >
              <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-tint text-tint-ink">
                <Icon name="user" size={20} />
              </span>
              <span>
                <span className="block font-display text-[24px] font-bold uppercase leading-none">
                  I turn up and play
                </span>
                <span className="mt-1 block text-[13px] leading-5 text-ink-2">
                  See your court, your partner and the clock. Join with a code or a QR.
                </span>
              </span>
            </button>
          </form>
        </div>
      ) : null}

      {step >= 3 ? (
        <div className="flex flex-1 flex-col gap-4">
          <h1 className="font-display text-[40px] font-extrabold uppercase leading-[0.95]">
            Set up your usual night.
          </h1>
          <Muted className="block text-[15px] leading-6">
            A session you can start with one tap next time. Change anything on the night.
          </Muted>
          <Card className="space-y-2">
            <div className="font-display text-[20px] font-bold uppercase">What you&apos;ll set</div>
            <ul className="list-disc space-y-1 pl-5 text-[14px] leading-6 text-ink-2">
              <li>Name, venue and courts</li>
              <li>Round length and doubles or singles</li>
              <li>Who&apos;s in: club members, or anyone with the code</li>
            </ul>
          </Card>
          <Card className="space-y-2">
            <div className="font-display text-[20px] font-bold uppercase">Got a regular crowd?</div>
            <p className="text-[14px] leading-6 text-ink-2">
              Create a club first and send one invite link. Everyone who joins keeps their own name
              and photo, and you tick them as regulars.
            </p>
            <LinkButton href="/clubs/new?from=welcome" variant="tonal" className="w-full">
              <Icon name="users" size={16} />
              Create a club
            </LinkButton>
          </Card>
          <div className="flex-1" />
          <LinkButton
            href="/start?new=1&from=welcome"
            size="lg"
            className="w-full font-display text-[20px] uppercase tracking-[0.06em]"
          >
            Set it up now
          </LinkButton>
          <form action={finishOnboarding.bind(null, '/dashboard')}>
            <Button type="submit" variant="ghost" size="lg" className="w-full">
              Skip for now
            </Button>
          </form>
        </div>
      ) : null}
    </main>
  );
}
