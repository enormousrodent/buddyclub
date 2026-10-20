import { ApiError } from '@buddyclub/api-client';
import type { PublicEvent } from '@buddyclub/shared-types';
import { headers } from 'next/headers';
import { Lockup } from '../../../../components/brand';
import { Alert, Card, Icon, LinkButton, Muted, Page, StateBadge } from '../../../../components/ui';
import { apiForUser, apiPublic } from '../../../../lib/api';
import type { Product } from '../../../../lib/env';
import { getSessionUser } from '../../../../lib/supabase/server';
import { JoinButton } from './join-button';

export const metadata = { title: 'Join' };

function when(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** QR landing page: what the event is, and one tap to register or check in for club members. */
export default async function JoinPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const product = ((await headers()).get('x-buddyclub-product') ?? 'buddyclub') as Product;
  const user = await getSessionUser();
  let event: PublicEvent;
  try {
    event = await (user ? apiForUser() : apiPublic()).public.event(slug);
  } catch (error) {
    const missing = error instanceof ApiError && error.status === 404;
    return (
      <Page title={missing ? 'Code not recognised' : 'Something went wrong'} display>
        <Card>
          <Muted>
            {missing
              ? 'This code is no longer active. Ask the organiser for the current one.'
              : 'Try scanning again in a moment.'}
          </Muted>
        </Card>
      </Page>
    );
  }
  const viewer = event.viewer;
  return (
    <Page
      title={event.name}
      eyebrow={event.organisationName}
      lead={`${when(event.startsAt)}${event.venueName ? ` · ${event.venueName}` : ''}`}
      action={<StateBadge state={event.state} />}
    >
      <div className="mb-4">
        <Lockup product={product} size={24} />
      </div>
      {event.kind === 'meet' ? (
        <Card className="space-y-3">
          <p className="text-[15px] leading-6">
            This is a competition day. Scores and standings are on the public board.
          </p>
          <LinkButton href={`/board/${slug}`} variant="secondary" className="w-full">
            <Icon name="trophy" size={18} />
            Open the live board
          </LinkButton>
        </Card>
      ) : !user ? (
        <Card className="space-y-3">
          <p className="text-[15px] leading-6">
            Sign in with your Buddy Club account to check in. New here? Ask the organiser to add you
            as a guest and they will give you a link.
          </p>
          <LinkButton
            href={`/sign-in?next=${encodeURIComponent(`/join/${slug}`)}`}
            size="lg"
            className="w-full"
          >
            Sign in to check in
          </LinkButton>
          <LinkButton href={`/board/${slug}`} variant="ghost" className="w-full">
            Just show me the court board
          </LinkButton>
        </Card>
      ) : viewer && !viewer.member ? (
        <Alert tone="warning" title="You're not a member of this club yet">
          Ask the organiser to invite you, or to add you as a walk-in guest tonight.
        </Alert>
      ) : (
        <Card className="space-y-3">
          {viewer?.participantStatus === 'checked_in' ? (
            <Alert tone="success" title="You're checked in">
              Your court shows on your phone once a round is published.
            </Alert>
          ) : (
            <p className="text-[15px] leading-6">
              {event.state === 'draft'
                ? 'Register now and check in when the session opens.'
                : "Tap to check in. The organiser's screen updates straight away."}
            </p>
          )}
          <JoinButton slug={slug} checkedIn={viewer?.participantStatus === 'checked_in'} />
          <LinkButton href={`/board/${slug}`} variant="ghost" className="w-full">
            Open the court board
          </LinkButton>
        </Card>
      )}
    </Page>
  );
}
