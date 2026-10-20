import { roleAllows } from '@buddyclub/auth';
import { redirect } from 'next/navigation';
import { CopyButton } from '../../../../../../components/copy-button';
import { QrCode } from '../../../../../../components/qr-code';
import { Kicker } from '../../../../../../components/rally-kit';
import {
  Badge,
  Button,
  Card,
  Icon,
  LinkButton,
  Muted,
  Page,
  TextButton,
} from '../../../../../../components/ui';
import { apiForUser } from '../../../../../../lib/api';
import { absoluteUrl } from '../../../../../../lib/links';
import { getSessionUser } from '../../../../../../lib/supabase/server';
import { createPlayerInvite, revokePlayerInvite } from './actions';
import { INVITE_DAYS, INVITE_USES } from './config';

export const metadata = { title: 'Invite players' };

/**
 * Invite players to the preset's club: one link for the group chat, shown as a QR too. People
 * who open it sign in once, join the club, and appear in the regulars list and on the Players
 * screen with their own name and photo.
 */
export default async function InvitePlayersPage({
  params,
  searchParams,
}: {
  params: Promise<{ seriesId: string }>;
  searchParams: Promise<{ t?: string }>;
}) {
  const { seriesId } = await params;
  if (!(await getSessionUser())) redirect(`/sign-in?next=/presets/${seriesId}/invite`);
  const { t: token } = await searchParams;
  const api = apiForUser();
  const series = await api.sessions.get(seriesId);
  const org = await api.organisations.get(series.organisationId);
  const canInvite = org.myRole ? roleAllows(org.myRole, 'members.invite') : false;

  if (org.kind === 'personal') {
    return (
      <Page title="Invite players" eyebrow={series.name} back={`/presets/${seriesId}`}>
        <Card className="space-y-3">
          <p className="text-[15px] leading-6">
            This preset is in your personal workspace, so there is nothing for players to join.
            Walk-ins still work on the night; create a club if you want people to sign up and keep
            their own name and photo.
          </p>
          <LinkButton href="/clubs/new" className="w-full">
            Create a club
          </LinkButton>
        </Card>
      </Page>
    );
  }

  const [members, invitations] = await Promise.all([
    api.organisations.members(series.organisationId),
    canInvite ? api.invitations.list(series.organisationId) : Promise.resolve({ items: [] }),
  ]);
  const active = invitations.items.filter(
    (i) => !i.revokedAt && new Date(i.expiresAt).getTime() > Date.now() && i.useCount < i.maxUses,
  );
  const joined = members.items.filter((m) => m.status === 'active').length;
  const link = token ? await absoluteUrl(`/invite/${token}`) : null;
  const message = link
    ? `Join ${org.name} on Rally and see your court on your phone: ${link}`
    : null;

  return (
    <Page
      title="Invite players"
      eyebrow={org.name}
      back={`/presets/${seriesId}`}
      lead="One link for the group chat. They sign in once and they're in."
    >
      {link && message ? (
        <Card className="mb-5 space-y-3">
          <QrCode url={link} caption="Scan to join the club" size={200} />
          <div className="rounded-control bg-surface-2 px-4 py-3 text-[14px] leading-6">
            {message}
          </div>
          <CopyButton value={message} label="Share the message" />
          <Muted>
            Shown once. Anyone with it joins as a player for {INVITE_DAYS} days, up to {INVITE_USES}{' '}
            people. Come back here for a new one.
          </Muted>
        </Card>
      ) : null}

      {canInvite ? (
        <Card className="mb-5 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="font-display text-[24px] font-bold uppercase leading-none">
                {joined} signed up
              </div>
              <Muted className="mt-1 block">
                {active.length
                  ? `${active.length} link${active.length === 1 ? '' : 's'} open`
                  : 'No open invite link'}
              </Muted>
            </div>
            <form action={createPlayerInvite.bind(null, seriesId, series.organisationId)}>
              <Button type="submit" size="sm">
                <Icon name="share" size={14} />
                New link
              </Button>
            </form>
          </div>
          {active.length ? (
            <ul className="divide-y divide-hairline">
              {active.map((i) => (
                <li key={i.id} className="flex min-h-12 items-center justify-between gap-3 py-2">
                  <span className="text-sm">
                    <Badge>{i.useCount} joined</Badge>{' '}
                    <Muted>expires {new Date(i.expiresAt).toLocaleDateString('en-GB')}</Muted>
                  </span>
                  <form
                    action={revokePlayerInvite.bind(null, seriesId, series.organisationId, i.id)}
                  >
                    <TextButton>Revoke</TextButton>
                  </form>
                </li>
              ))}
            </ul>
          ) : null}
        </Card>
      ) : (
        <Card>
          <Muted>Only club admins can create invite links.</Muted>
        </Card>
      )}

      <Kicker className="mb-2">What they see</Kicker>
      <Card>
        <ol className="list-decimal space-y-1 pl-5 text-[14px] leading-6 text-ink-2">
          <li>Open the link, sign in with their email. No password.</li>
          <li>They join {org.name} and land on their Rally home.</li>
          <li>
            You tick them as a regular on the preset. From then on they are registered the moment
            you start, and they check themselves in with the session code.
          </li>
        </ol>
      </Card>
    </Page>
  );
}
