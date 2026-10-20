import { roleAllows } from '@buddyclub/auth';
import type { Member, Participant } from '@buddyclub/shared-types';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ActionForm } from '../../../../../components/action-form';
import { Kicker } from '../../../../../components/rally-kit';
import {
  Avatar,
  Button,
  Card,
  Field,
  Icon,
  Input,
  LinkButton,
  Muted,
  Page,
} from '../../../../../components/ui';
import { apiForUser } from '../../../../../lib/api';
import { getSessionUser } from '../../../../../lib/supabase/server';
import { startPreset } from '../../../actions';
import { saveRegulars, updatePreset } from './actions';

export const metadata = { title: 'Preset' };

function RegularRow({
  p,
  checked,
  avatarUrl,
  note,
}: {
  p: Participant;
  checked: boolean;
  avatarUrl: string | null;
  note?: string | undefined;
}) {
  return (
    <li>
      <label className="flex min-h-14 cursor-pointer items-center gap-3 py-2">
        <input
          type="checkbox"
          name="participantId"
          value={p.id}
          defaultChecked={checked}
          className="h-5 w-5 shrink-0 accent-primary"
        />
        <Avatar name={p.displayName} size={36} src={avatarUrl ?? undefined} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-semibold">{p.displayName}</span>
          {note ? <span className="block text-xs text-muted">{note}</span> : null}
        </span>
      </label>
    </li>
  );
}

/**
 * A preset: the session you run every week. Name and timings, the people who have joined the
 * club, the regulars who are registered automatically when it starts, and the one-tap start.
 */
export default async function PresetPage({ params }: { params: Promise<{ seriesId: string }> }) {
  const { seriesId } = await params;
  if (!(await getSessionUser())) redirect(`/sign-in?next=/presets/${seriesId}`);
  const api = apiForUser();
  const [series, regulars, presets] = await Promise.all([
    api.sessions.get(seriesId),
    api.sessions.regulars(seriesId),
    api.sessions.presets(),
  ]);
  const preset = presets.items.find((p) => p.seriesId === seriesId);
  const isClub = preset ? preset.organisationKind === 'club' : true;
  const [players, org, members] = await Promise.all([
    api.participants.list(series.organisationId),
    api.organisations.get(series.organisationId),
    isClub
      ? api.organisations.members(series.organisationId)
      : Promise.resolve({ items: [] as Member[] }),
  ]);
  const regularIds = new Set(regulars.items.map((r) => r.participantId));
  const canInvite = org.myRole ? roleAllows(org.myRole, 'members.invite') : false;
  const byProfile = new Map(members.items.map((m) => [m.profileId, m]));
  const signedUp = players.items.filter((p) => p.userProfileId && byProfile.has(p.userProfileId));
  const byName = players.items.filter((p) => !signedUp.includes(p));
  const regularCount = players.items.filter((p) => regularIds.has(p.id)).length;

  return (
    <Page
      title={series.name}
      eyebrow={
        preset
          ? preset.organisationKind === 'personal'
            ? 'Just me'
            : preset.organisationName
          : 'Preset'
      }
      back="/start"
      action={
        preset?.activeOccurrenceId ? undefined : (
          <form action={startPreset.bind(null, seriesId)}>
            <Button type="submit" size="sm">
              <Icon name="play" size={14} />
              Start now
            </Button>
          </form>
        )
      }
    >
      {isClub ? (
        <Card className="mb-5 flex items-center justify-between gap-3">
          <div>
            <div className="font-display text-[24px] font-bold uppercase leading-none">
              {members.items.length} in the club
            </div>
            <Muted className="mt-1 block">
              {members.items.length > 1
                ? 'Everyone who signed up with your link.'
                : 'Send the invite link and people appear here as they sign up.'}
            </Muted>
          </div>
          {canInvite ? (
            <LinkButton href={`/presets/${seriesId}/invite`} size="sm" variant="tonal">
              <Icon name="share" size={14} />
              Invite
            </LinkButton>
          ) : null}
        </Card>
      ) : null}

      <Kicker className="mb-2">Regulars · {regularCount}</Kicker>
      <Card className="mb-5">
        <Muted className="mb-3 block">
          Everyone ticked is registered the moment you start this session, so on the night you only
          mark who&apos;s here. Walk-ins can still be added as usual.
        </Muted>
        {players.items.length ? (
          <ActionForm
            action={saveRegulars.bind(null, seriesId)}
            submitLabel="Save regulars"
            variant="primary"
          >
            {signedUp.length ? (
              <>
                <Kicker>Signed up · {signedUp.length}</Kicker>
                <ul className="divide-y divide-hairline">
                  {signedUp.map((p) => (
                    <RegularRow
                      key={p.id}
                      p={p}
                      checked={regularIds.has(p.id)}
                      avatarUrl={byProfile.get(p.userProfileId ?? '')?.avatarUrl ?? null}
                    />
                  ))}
                </ul>
              </>
            ) : null}
            {byName.length ? (
              <>
                <Kicker>
                  {signedUp.length ? 'Added by name' : 'Players'} · {byName.length}
                </Kicker>
                <ul className="divide-y divide-hairline">
                  {byName.map((p) => (
                    <RegularRow
                      key={p.id}
                      p={p}
                      checked={regularIds.has(p.id)}
                      avatarUrl={null}
                      note={isClub ? 'No account yet' : undefined}
                    />
                  ))}
                </ul>
              </>
            ) : null}
          </ActionForm>
        ) : (
          <Muted>
            No players yet.{' '}
            {isClub && canInvite ? (
              <>
                <Link href={`/presets/${seriesId}/invite`} className="font-semibold text-primary">
                  Invite them
                </Link>{' '}
                and they appear here, or add walk-ins by name on the night.
              </>
            ) : (
              'Add walk-ins by name on the night and they appear here.'
            )}
          </Muted>
        )}
      </Card>

      <Kicker className="mb-2">Settings</Kicker>
      <Card>
        <ActionForm
          action={updatePreset.bind(null, seriesId, series.version)}
          submitLabel="Save"
          variant="secondary"
          resetOnSuccess={false}
        >
          <Field label="Name" hint="Tip: name it after the night, like Thursday pickleball.">
            <Input name="name" defaultValue={series.name} required maxLength={160} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Round length (min)">
              <Input
                name="roundMinutes"
                type="number"
                min={3}
                max={120}
                defaultValue={series.defaultRoundMinutes}
                inputMode="numeric"
              />
            </Field>
            <Field label="Session length (min)">
              <Input
                name="durationMinutes"
                type="number"
                min={15}
                max={720}
                defaultValue={series.defaultDurationMinutes}
                inputMode="numeric"
              />
            </Field>
          </div>
        </ActionForm>
        <Muted className="mt-3 block text-xs">
          {preset?.venueName
            ? `${preset.venueName} · ${preset.courts} court${preset.courts === 1 ? '' : 's'}. Courts come from the venue.`
            : 'No venue set; courts are chosen on the night.'}
        </Muted>
      </Card>
    </Page>
  );
}
