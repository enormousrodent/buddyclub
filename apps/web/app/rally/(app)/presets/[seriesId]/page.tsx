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
  Muted,
  Page,
} from '../../../../../components/ui';
import { apiForUser } from '../../../../../lib/api';
import { getSessionUser } from '../../../../../lib/supabase/server';
import { startPreset } from '../../../actions';
import { saveRegulars, updatePreset } from './actions';

export const metadata = { title: 'Preset' };

/**
 * A preset: the session you run every week. Name and timings, the regulars who are registered
 * automatically when it starts, and the one-tap start.
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
  const players = (await api.participants.list(series.organisationId)).items;
  const regularIds = new Set(regulars.items.map((r) => r.participantId));

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
      <Kicker className="mb-2">Regulars · {regulars.items.length}</Kicker>
      <Card className="mb-5">
        <Muted className="mb-3 block">
          Everyone ticked is registered the moment you start this session, so on the night you only
          mark who&apos;s here. Walk-ins can still be added as usual.
        </Muted>
        {players.length ? (
          <ActionForm
            action={saveRegulars.bind(null, seriesId)}
            submitLabel="Save regulars"
            variant="primary"
          >
            <ul className="divide-y divide-hairline">
              {players.map((p) => (
                <li key={p.id}>
                  <label className="flex min-h-14 cursor-pointer items-center gap-3 py-2">
                    <input
                      type="checkbox"
                      name="participantId"
                      value={p.id}
                      defaultChecked={regularIds.has(p.id)}
                      className="h-5 w-5 shrink-0 accent-[var(--bc-primary)]"
                    />
                    <Avatar name={p.displayName} size={36} />
                    <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">
                      {p.displayName}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </ActionForm>
        ) : (
          <Muted>
            No players in this club yet. Add them from the club&apos;s Players page, or they appear
            here once they&apos;ve joined a session.
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
