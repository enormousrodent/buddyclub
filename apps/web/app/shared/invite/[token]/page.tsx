import { ApiError } from '@buddyclub/api-client';
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
  const user = await getSessionUser();
  const role = preview.role.replace('_', ' ');

  return (
    <Page title="You're invited">
      <Card className="space-y-3">
        <p>
          Join <strong>{preview.organisationName}</strong> as a <strong>{role}</strong>.
        </p>
        {!preview.redeemable ? (
          <Muted>This link has expired or has already been used.</Muted>
        ) : user ? (
          <ActionForm
            action={redeemInvitation.bind(null, token)}
            submitLabel="Join club"
            resetOnSuccess={false}
          />
        ) : (
          <div className="space-y-2">
            <Muted>Sign in or create an account to accept.</Muted>
            <LinkButton
              href={`/sign-in?next=${encodeURIComponent(`/invite/${token}`)}`}
              className="w-full"
            >
              Sign in to join
            </LinkButton>
          </div>
        )}
      </Card>
    </Page>
  );
}
