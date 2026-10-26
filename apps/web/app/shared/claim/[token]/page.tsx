import { redirect } from 'next/navigation';
import { Button, Card, LinkButton, Muted, Page } from '../../../../components/ui';
import { apiForUser } from '../../../../lib/api';
import { nights } from '../../../../lib/days';
import { getSessionUser } from '../../../../lib/supabase/server';
import { claimPlayer } from './actions';

export const metadata = { title: 'Is this you?' };

/**
 * Claim (ADR-008): a signed-in person holding an organiser's guest link takes over the
 * name-only player it points at. The page says what will happen before they agree.
 */
export default async function ClaimPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!(await getSessionUser())) redirect(`/sign-in?next=${encodeURIComponent(`/claim/${token}`)}`);
  const api = apiForUser();
  const [preview, me] = await Promise.all([
    api.guest.claimPreview(token).catch(() => null),
    api.me(),
  ]);

  if (!preview)
    return (
      <Page title="Is this you?" back="/dashboard">
        <Card>
          <Muted>This link is not one we recognise. Ask the organiser for a new one.</Muted>
        </Card>
      </Page>
    );

  return (
    <Page
      title="Is this you?"
      eyebrow={preview.organisation.name}
      back="/dashboard"
      lead={`The organiser added you as "${preview.participant.displayName}".`}
    >
      <Card className="space-y-3">
        {preview.claimable ? (
          <>
            <p className="text-[15px] leading-6">
              Say yes and that player becomes <strong>{me.profile.displayName}</strong>: you join{' '}
              {preview.organisation.name}, keep{' '}
              {preview.nightsPlayed
                ? `the ${nights(preview.nightsPlayed)} you have played`
                : 'any nights you play'}
              , stay on any regulars lists, and see your sessions on your own phone.
            </p>
            <form action={claimPlayer.bind(null, token)}>
              <Button type="submit" size="lg" className="w-full">
                Yes, that&apos;s me
              </Button>
            </form>
            <LinkButton href="/dashboard" variant="ghost" className="w-full">
              Not me
            </LinkButton>
          </>
        ) : (
          <>
            <Muted>{preview.reason}</Muted>
            <LinkButton href="/dashboard" variant="secondary" className="w-full">
              Back to home
            </LinkButton>
          </>
        )}
      </Card>
    </Page>
  );
}
