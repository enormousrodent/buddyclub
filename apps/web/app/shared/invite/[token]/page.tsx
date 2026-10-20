import { ApiError } from '@buddyclub/api-client';
import { headers } from 'next/headers';
import { ActionForm } from '../../../../components/action-form';
import { Card, LinkButton, Muted, Page } from '../../../../components/ui';
import { apiPublic } from '../../../../lib/api';
import { getSessionUser } from '../../../../lib/supabase/server';
import { redeemInvitation } from './actions';

export const metadata = { title: 'Invitation' };

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  let preview;
  try {
    preview = await apiPublic().invitations.preview(token);
  } catch (error) {
    const missing = error instanceof ApiError && error.status === 404;
    return (
      <Page title="Invitation">
        <Card>
          <p>
            {missing
              ? 'This invitation link is not valid.'
              : 'Could not load this invitation right now.'}
          </p>
        </Card>
      </Page>
    );
  }
  const [user, product] = await Promise.all([
    getSessionUser(),
    headers().then((h) => h.get('x-buddyclub-product')),
  ]);
  const rally = product === 'rally';
  const role = preview.role.replace('_', ' ');

  return (
    <Page title={rally ? `Join ${preview.organisationName}` : "You're invited"}>
      <Card className="space-y-3">
        {rally ? (
          <p className="text-[15px] leading-6">
            {preview.role === 'participant'
              ? 'Their sessions show up on your Rally home. On the night, check in with the code and see your court on your own phone.'
              : `You'll join as ${role}.`}
          </p>
        ) : (
          <p>
            Join <strong>{preview.organisationName}</strong> as a <strong>{role}</strong>.
          </p>
        )}
        {!preview.redeemable ? (
          <Muted>This link has expired or has already been used.</Muted>
        ) : user ? (
          <ActionForm
            action={redeemInvitation.bind(null, token)}
            submitLabel={rally ? "I'm in" : 'Join club'}
            size={rally ? 'lg' : 'md'}
            resetOnSuccess={false}
          />
        ) : (
          <div className="space-y-2">
            <Muted>
              {rally
                ? 'Sign in with your email to accept. No password needed.'
                : 'Sign in or create an account to accept.'}
            </Muted>
            <LinkButton
              href={`/sign-in?next=${encodeURIComponent(`/invite/${token}`)}`}
              className="w-full"
              size={rally ? 'lg' : 'md'}
            >
              Sign in to join
            </LinkButton>
          </div>
        )}
      </Card>
    </Page>
  );
}
