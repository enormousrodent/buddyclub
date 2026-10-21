import { redirect } from 'next/navigation';
import { RatingForm } from '../../../../../components/rating-form';
import { Card, Muted, Page } from '../../../../../components/ui';
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
  const [occurrence, rating] = await Promise.all([
    api.occurrences.get(occurrenceId),
    api.occurrences.ratingSummary(occurrenceId),
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
