import { levelLabel } from '@buddyclub/shared-types';
import { notFound, redirect } from 'next/navigation';
import { ActionForm } from '../../../../../components/action-form';
import {
  Avatar,
  Button,
  Card,
  Field,
  Muted,
  Page,
  SectionHeading,
  Textarea,
} from '../../../../../components/ui';
import { apiForUser } from '../../../../../lib/api';
import { describeDays, nights } from '../../../../../lib/days';
import { whenIn } from '../../../../../lib/sessions';
import { getSessionUser } from '../../../../../lib/supabase/server';
import { blockPerson, reportPerson, sayHi, unblockPerson } from '../actions';

export const metadata = { title: 'Buddy' };

/**
 * A member's card (Addendum 1.4 step 3): what they chose to show, to someone allowed to see it.
 * A block in either direction reads as not found, so nothing here reveals one.
 */
export default async function BuddyPage({ params }: { params: Promise<{ profileId: string }> }) {
  const { profileId } = await params;
  if (!(await getSessionUser()))
    redirect(`/sign-in?next=${encodeURIComponent(`/buddies/${profileId}`)}`);
  const card = await apiForUser()
    .buddies.get(profileId)
    .catch(() => null);
  if (!card) notFound();

  const together = card.sharedNights
    ? `${nights(card.sharedNights)} together${card.lastPlayedAt ? `, last ${whenIn(card.lastPlayedAt)}` : ''}`
    : 'Found by Find me';

  return (
    <Page title={card.displayName} back="/buddies" eyebrow={card.locality ?? undefined}>
      <Card className="flex items-start gap-4">
        <Avatar name={card.displayName} src={card.avatarUrl} size={64} />
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-semibold text-muted">{together}</div>
          {card.bio ? <p className="mt-1 text-[15px] leading-6">{card.bio}</p> : null}
          <div className="mt-3 flex flex-wrap gap-2">
            {card.blocked ? (
              <form action={unblockPerson.bind(null, card.profileId)}>
                <Button type="submit" variant="secondary" size="sm">
                  Unblock
                </Button>
              </form>
            ) : card.hello.sent ? (
              <span className="inline-flex min-h-9 items-center rounded-full bg-surface-2 px-3.5 text-[13px] font-semibold text-muted">
                You said hi
              </span>
            ) : (
              <form action={sayHi.bind(null, card.profileId)}>
                <Button type="submit" size="sm">
                  Say hi
                </Button>
              </form>
            )}
            {card.hello.received ? (
              <span className="inline-flex min-h-9 items-center rounded-full bg-primary/15 px-3.5 text-[13px] font-bold text-primary">
                Said hi to you
              </span>
            ) : null}
          </div>
        </div>
      </Card>

      <SectionHeading>Plays</SectionHeading>
      <Card>
        {card.activities.length ? (
          <ul className="divide-y divide-hairline">
            {card.activities.map((a) => {
              const level = a.level ? levelLabel(a.activityId, a.level) : null;
              const days = describeDays(a.days);
              return (
                <li key={a.activityId} className="py-2.5 first:pt-0 last:pb-0">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-[15px] font-bold">{a.activityName}</span>
                    {level ? <span className="text-[13px] text-muted">{level}</span> : null}
                  </div>
                  {days ? <div className="text-[13px] text-ink-2">Free {days}</div> : null}
                  {a.note ? <div className="text-[13px] text-muted">{a.note}</div> : null}
                </li>
              );
            })}
          </ul>
        ) : (
          <Muted>Nothing listed yet.</Muted>
        )}
      </Card>

      {card.gear && card.gear.length ? (
        <>
          <SectionHeading>Gear</SectionHeading>
          <Card>
            <ul className="divide-y divide-hairline">
              {card.gear.map((g, i) => (
                <li key={i} className="py-2 first:pt-0 last:pb-0 text-[14px]">
                  <span className="font-semibold">{g.name}</span>
                  {g.detail ? <span className="text-muted"> · {g.detail}</span> : null}
                </li>
              ))}
            </ul>
          </Card>
        </>
      ) : null}

      <SectionHeading>Not right?</SectionHeading>
      <Card className="space-y-3">
        <Muted>
          Blocking hides you from each other everywhere, quietly. Reporting goes to a person to look
          at; they are not told.
        </Muted>
        {!card.blocked ? (
          <form action={blockPerson.bind(null, card.profileId)}>
            <Button type="submit" variant="secondary" size="sm">
              Block {card.displayName}
            </Button>
          </form>
        ) : null}
        <details>
          <summary className="cursor-pointer text-[14px] font-semibold text-danger">Report</summary>
          <div className="mt-3">
            <ActionForm
              action={reportPerson.bind(null, card.profileId)}
              submitLabel="Send report"
              variant="secondary"
            >
              <Field label="What happened">
                <Textarea name="reason" rows={3} maxLength={500} required />
              </Field>
            </ActionForm>
          </div>
        </details>
      </Card>
    </Page>
  );
}
