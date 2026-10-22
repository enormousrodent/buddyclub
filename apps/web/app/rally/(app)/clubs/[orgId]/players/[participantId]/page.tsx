import { roleAllows } from '@buddyclub/auth';
import { notFound } from 'next/navigation';
import { ActionForm } from '../../../../../../../components/action-form';
import { Badge, Card, Muted, Page, SectionHeading } from '../../../../../../../components/ui';
import { apiForUser } from '../../../../../../../lib/api';
import { archiveParticipant, issueGuestLink, revokeGuestLink } from '../../../actions';

export const metadata = { title: 'Player' };

export default async function PlayerPage({
  params,
}: {
  params: Promise<{ orgId: string; participantId: string }>;
}) {
  const { orgId, participantId } = await params;
  const api = apiForUser();
  const org = await api.organisations.get(orgId);
  if (!org.myRole || !roleAllows(org.myRole, 'participants.manage')) notFound();
  const [participant, grants] = await Promise.all([
    api.participants.get(orgId, participantId),
    api.guestGrants.list(orgId, participantId),
  ]);
  const isGuest = participant.userProfileId === null;
  const liveGrants = grants.items.filter(
    (g) =>
      !g.revokedAt && new Date(g.expiresAt).getTime() > Date.now() && g.redeemCount < g.maxRedeems,
  );

  return (
    <Page title={participant.displayName} back={`/clubs/${orgId}/players`}>
      <Card className="space-y-1">
        <div>
          <Badge>{isGuest ? 'guest (no account)' : 'linked to an account'}</Badge>
        </div>
        <Muted>Added {new Date(participant.createdAt).toLocaleDateString()}</Muted>
        {participant.skillRating !== null ? <Muted>Skill {participant.skillRating}</Muted> : null}
        {participant.archivedAt ? <Muted>Archived</Muted> : null}
      </Card>

      {isGuest && !participant.archivedAt ? (
        <>
          <SectionHeading>Guest link</SectionHeading>
          <Card>
            <p className="mb-3 text-sm">
              A guest link lets {participant.displayName} see their own schedule on their phone
              without an account. It lasts 24 hours and works on up to 3 devices.
            </p>
            <ActionForm
              action={issueGuestLink.bind(null, orgId, participantId)}
              submitLabel="Issue guest link"
            />
          </Card>
          {grants.items.length ? (
            <div className="mt-3 space-y-2">
              {grants.items.map((g) => {
                const live = liveGrants.some((l) => l.id === g.id);
                return (
                  <Card key={g.id} className="flex items-center gap-3 text-sm">
                    <div className="min-w-0 flex-1">
                      <div>
                        {g.redeemCount}/{g.maxRedeems} devices
                      </div>
                      <Muted>
                        {g.revokedAt
                          ? 'Revoked'
                          : live
                            ? `Expires ${new Date(g.expiresAt).toLocaleString()}`
                            : 'Expired or used up'}
                      </Muted>
                    </div>
                    {live ? (
                      <form action={revokeGuestLink.bind(null, orgId, participantId, g.id)}>
                        <button type="submit" className="text-danger">
                          Revoke
                        </button>
                      </form>
                    ) : null}
                  </Card>
                );
              })}
            </div>
          ) : null}
        </>
      ) : null}

      {!participant.archivedAt ? (
        <Card className="mt-6">
          <p className="mb-3 text-sm">
            Archiving hides the player from rosters and revokes their guest links. History is kept.
          </p>
          <form action={archiveParticipant.bind(null, orgId, participantId)}>
            <button
              type="submit"
              className="min-h-11 rounded-control border border-[var(--bc-danger)] px-4 text-sm font-medium text-danger"
            >
              Archive player
            </button>
          </form>
        </Card>
      ) : null}
    </Page>
  );
}
