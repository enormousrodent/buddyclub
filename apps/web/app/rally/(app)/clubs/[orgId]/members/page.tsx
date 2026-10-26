import { GRANTABLE_ROLES, roleAllows } from '@buddyclub/auth';
import { ActionForm } from '../../../../../../components/action-form';
import {
  Avatar,
  Button,
  Card,
  Field,
  Input,
  List,
  Muted,
  Page,
  Row,
  SectionHeading,
  Select,
  StateBadge,
} from '../../../../../../components/ui';
import { apiForUser } from '../../../../../../lib/api';
import { whenIn } from '../../../../../../lib/sessions';
import {
  changeMemberRole,
  createInvitation,
  decideJoinRequest,
  removeMember,
  revokeInvitation,
} from '../../actions';
import { ClubNav } from '../club-nav';

export const metadata = { title: 'Members' };

export default async function MembersPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const api = apiForUser();
  const [org, members, me] = await Promise.all([
    api.organisations.get(orgId),
    api.organisations.members(orgId),
    api.me(),
  ]);
  const canInvite = org.myRole ? roleAllows(org.myRole, 'members.invite') : false;
  const canManage = org.myRole ? roleAllows(org.myRole, 'members.manage') : false;
  const [invitationList, requests] = canInvite
    ? await Promise.all([api.invitations.list(orgId), api.joinRequests.list(orgId, 'pending')])
    : [{ items: [] }, { items: [] }];
  const invitations = invitationList.items;

  return (
    <Page title={org.name} back={`/clubs/${orgId}`}>
      <ClubNav orgId={orgId} current="members" />

      {requests.items.length ? (
        <>
          <SectionHeading>Asked to join</SectionHeading>
          <div className="mb-4 space-y-2">
            {requests.items.map((r) => (
              <Card key={r.id} className="flex items-center gap-3">
                <Avatar name={r.displayName} src={r.avatarUrl} size={40} />
                <div className="min-w-0 flex-1 text-sm">
                  <div className="font-bold">{r.displayName}</div>
                  <Muted className="block">
                    {[
                      r.sports
                        .map((sp) =>
                          sp.level
                            ? `${sp.activityName} (${sp.level.replace('_', ' ')})`
                            : sp.activityName,
                        )
                        .join(', ') || 'No sports listed',
                      r.seriesName ? `asked about ${r.seriesName}` : null,
                      whenIn(r.createdAt),
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </Muted>
                  {r.note ? (
                    <div className="mt-1 text-[13px] text-ink-2">&ldquo;{r.note}&rdquo;</div>
                  ) : null}
                </div>
                <div className="flex shrink-0 flex-col gap-1.5">
                  <form action={decideJoinRequest.bind(null, orgId, r.id, true)}>
                    <Button type="submit" size="sm">
                      Approve
                    </Button>
                  </form>
                  <form action={decideJoinRequest.bind(null, orgId, r.id, false)}>
                    <button type="submit" className="w-full text-center text-[13px] text-danger">
                      Decline
                    </button>
                  </form>
                </div>
              </Card>
            ))}
          </div>
        </>
      ) : null}

      <SectionHeading>Members</SectionHeading>
      <List>
        {members.items.map((m) => (
          <Row
            key={m.profileId}
            title={m.displayName}
            subtitle={m.status !== 'active' ? m.status : undefined}
            right={
              canManage && m.profileId !== me.profile.id ? (
                <MemberControls orgId={orgId} profileId={m.profileId} role={m.role} />
              ) : (
                <StateBadge state={m.role} />
              )
            }
          />
        ))}
      </List>

      {canInvite ? (
        <>
          <SectionHeading>Invite people</SectionHeading>
          <Card>
            <ActionForm
              action={createInvitation.bind(null, orgId)}
              submitLabel="Create invitation link"
            >
              <Field label="They join as">
                <Select name="role" defaultValue="participant">
                  {GRANTABLE_ROLES.filter(
                    (r) => r !== 'org_admin' || org.myRole === 'org_admin',
                  ).map((r) => (
                    <option key={r} value={r}>
                      {r.replace('_', ' ')}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field
                label="How many people can use it"
                hint="Valid for 7 days. The link is shown once."
              >
                <Input
                  name="maxUses"
                  type="number"
                  min={1}
                  max={500}
                  defaultValue={1}
                  inputMode="numeric"
                />
              </Field>
            </ActionForm>
          </Card>
          {invitations.length ? (
            <div className="mt-3 space-y-2">
              {invitations.map((i) => {
                const live =
                  !i.revokedAt &&
                  new Date(i.expiresAt).getTime() > Date.now() &&
                  i.useCount < i.maxUses;
                return (
                  <Card key={i.id} className="flex items-center gap-3">
                    <div className="min-w-0 flex-1 text-sm">
                      <div>
                        <StateBadge state={i.role} /> {i.useCount}/{i.maxUses} used
                      </div>
                      <Muted>
                        {live
                          ? `Expires ${new Date(i.expiresAt).toLocaleDateString()}`
                          : i.revokedAt
                            ? 'Revoked'
                            : 'Expired or used up'}
                      </Muted>
                    </div>
                    {live ? (
                      <form action={revokeInvitation.bind(null, orgId, i.id)}>
                        <button type="submit" className="text-sm text-danger">
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
    </Page>
  );
}

function MemberControls({
  orgId,
  profileId,
  role,
}: {
  orgId: string;
  profileId: string;
  role: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <ActionForm
        action={changeMemberRole.bind(null, orgId, profileId)}
        submitLabel="Set"
        variant="secondary"
        className="flex items-center gap-2 space-y-0"
        resetOnSuccess={false}
      >
        <Select name="role" defaultValue={role}>
          {GRANTABLE_ROLES.map((r) => (
            <option key={r} value={r}>
              {r.replace('_', ' ')}
            </option>
          ))}
        </Select>
      </ActionForm>
      <form action={removeMember.bind(null, orgId, profileId)}>
        <button type="submit" className="text-sm text-danger">
          Remove
        </button>
      </form>
    </div>
  );
}
