import { redirect } from 'next/navigation';
import { RatingForm } from '../../../../../components/rating-form';
import { Card, LinkButton, Muted, Page } from '../../../../../components/ui';
import { apiForUser } from '../../../../../lib/api';
import { whenIn } from '../../../../../lib/sessions';
import { getSessionUser } from '../../../../../lib/supabase/server';
import { rateNight } from '../../actions';

export const metadata = { title: 'Rate the night' };

/** Rate a night you attended: stars, then tags. One per person; no text. */
export default async function RateNightPage({
  params,
}: {
  params: Promise<{ occurrenceId: string }>;
}) {
  const { occurrenceId } = await params;
  if (!(await getSessionUser()))
    redirect(`/sign-in?next=${encodeURIComponent(`/sessions/${occurrenceId}/rate`)}`);
  const api = apiForUser();
  const [occurrence, rating, profile] = await Promise.all([
    api.occurrences.get(occurrenceId),
    api.occurrences.ratingSummary(occurrenceId),
    api.profile.get(),
  ]);
  const back = `/sessions/${occurrenceId}`;

  if (rating.myRating) {
    return (
      <Page title="Thanks" eyebrow={occurrence.seriesName} back={back}>
        <Card>
          <div className="font-display text-[24px] font-bold uppercase leading-none">
            {'★'.repeat(rating.myRating.score) || 'No stars'}
          </div>
          <Muted className="mt-2 block">You rated {whenIn(occurrence.startsAt)}. Thanks.</Muted>
        </Card>
        {!profile.onboarded.buddyclub ? (
          <Card className="mt-3 border-primary">
            <div className="font-display text-[20px] font-bold uppercase leading-none">
              Want more games with this lot?
            </div>
            <Muted className="mt-1 block">
              Say how good you are and when you&apos;re free. Two screens, and the people you play
              with can find you for a hit.
            </Muted>
            <LinkButton
              href={`/profile/complete?back=${encodeURIComponent(`/sessions/${occurrenceId}/rate`)}`}
              className="mt-3 w-full"
            >
              Complete my profile
            </LinkButton>
          </Card>
        ) : null}
        <LinkButton href="/buddies" variant="secondary" className="mt-3 w-full">
          See who was there
        </LinkButton>
      </Page>
    );
  }
  if (!rating.canRate) {
    return (
      <Page title="Rate the night" eyebrow={occurrence.seriesName} back={back}>
        <Card>
          <Muted>
            Ratings open when a night finishes and stay open for a week, for the people who were
            there.
          </Muted>
        </Card>
      </Page>
    );
  }
  return (
    <Page
      title="How was it?"
      eyebrow={`${occurrence.seriesName} · ${whenIn(occurrence.startsAt)}`}
      back={back}
    >
      <Card>
        <RatingForm action={rateNight.bind(null, occurrenceId)} />
      </Card>
    </Page>
  );
}
