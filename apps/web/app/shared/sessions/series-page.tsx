import { roleAllows } from '@buddyclub/auth';
import {
  RATING_TAGS,
  type Member,
  type Participant,
  type SessionSeries,
} from '@buddyclub/shared-types';
import { headers } from 'next/headers';
import Link from 'next/link';
import { ActionForm } from '../../../components/action-form';
import { Kicker } from '../../../components/rally-kit';
import { SessionAction } from '../../../components/session-card';
import { TimezoneField } from '../../../components/timezone-field';
import {
  Avatar,
  Card,
  Field,
  Icon,
  Input,
  LinkButton,
  List,
  Muted,
  Page,
  Row,
  Select,
  StateBadge,
} from '../../../components/ui';
import { apiForUser } from '../../../lib/api';
import {
  DEFAULT_LEVELS,
  FAIRNESS_FACTORS,
  FAIRNESS_LEVELS,
  levelForWeight,
} from '../../../lib/fairness';
import {
  describeSchedule,
  isHappeningNow,
  isUpcoming,
  weekdayName,
  whenIn,
} from '../../../lib/sessions';
import {
  addKeepApart,
  removeKeepApart,
  saveHosts,
  saveRegulars,
  saveSchedule,
  updateSession,
} from './series-actions';

const TAG_LABELS = new Map<string, string>(
  [...RATING_TAGS.positive, ...RATING_TAGS.negative].map((t) => [t.id, t.label]),
);

function TickRow({
  name,
  value,
  label,
  checked,
  avatarUrl,
  note,
}: {
  name: string;
  value: string;
  label: string;
  checked: boolean;
  avatarUrl: string | null;
  note?: string | undefined;
}) {
  return (
    <li>
      <label className="flex min-h-14 cursor-pointer items-center gap-3 py-2">
        <input
          type="checkbox"
          name={name}
          value={value}
          defaultChecked={checked}
          className="h-5 w-5 shrink-0 accent-primary"
        />
        <Avatar name={label} size={36} src={avatarUrl ?? undefined} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-semibold">{label}</span>
          {note ? <span className="block text-xs text-muted">{note}</span> : null}
        </span>
      </label>
    </li>
  );
}

function NameRow({ label, avatarUrl }: { label: string; avatarUrl: string | null }) {
  return (
    <li className="flex min-h-12 items-center gap-3 py-2">
      <Avatar name={label} size={32} src={avatarUrl ?? undefined} />
      <span className="truncate text-[15px] font-semibold">{label}</span>
    </li>
  );
}

/**
 * A session (Addendum 1.2): the thing you set up once and run every week. The next date and
 * the one action, then the schedule, who hosts, who usually comes, the defaults, and the nights
 * so far. Organisers edit; hosts see it and run nights.
 */
export async function SeriesPage({ series }: { series: SessionSeries }) {
  const seriesId = series.id;
  const api = apiForUser();
  const product = (await headers()).get('x-buddyclub-product');
  const [presets, regulars, hosts, org, occurrences, keepApart, rating] = await Promise.all([
    api.sessions.presets(),
    api.sessions.regulars(seriesId),
    api.sessions.hosts(seriesId),
    api.organisations.get(series.organisationId),
    api.occurrences.list(series.organisationId),
    api.sessions.keepApart(seriesId),
    api.sessions.ratingSummary(seriesId),
  ]);
  const preset = presets.items.find((p) => p.seriesId === seriesId);
  const rotation =
    (
      series.defaultRules as {
        rotation?: {
          mode?: string;
          format?: string;
          maxConsecutiveRests?: number;
          weights?: Partial<
            Record<'rest' | 'minutes' | 'partners' | 'opponents' | 'skill', number>
          >;
        };
      } | null
    )?.rotation ?? {};
  const usualMode = rotation.mode ?? 'mix';
  const usualFormat = rotation.format ?? 'doubles';
  const levelOf = (key: (typeof FAIRNESS_FACTORS)[number][0]) =>
    levelForWeight(rotation.weights?.[key], DEFAULT_LEVELS[key]);
  const topTags = rating.tags
    ? Object.entries(rating.tags)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([id]) => TAG_LABELS.get(id) ?? id)
    : [];
  const isClub = org.kind === 'club';
  const { canEdit, canRun } = series;
  const [players, members] = await Promise.all([
    canEdit
      ? api.participants.list(series.organisationId)
      : Promise.resolve({ items: [] as Participant[] }),
    isClub
      ? api.organisations.members(series.organisationId)
      : Promise.resolve({ items: [] as Member[] }),
  ]);
  const canInvite = org.myRole ? roleAllows(org.myRole, 'members.invite') : false;
  const tz = series.schedule?.timezone ?? null;

  const regularIds = new Set(regulars.items.map((r) => r.participantId));
  const hostIds = new Set(hosts.items.map((h) => h.profileId));
  const byProfile = new Map(members.items.map((m) => [m.profileId, m]));
  const signedUp = players.items.filter((p) => p.userProfileId && byProfile.has(p.userProfileId));
  const byName = players.items.filter((p) => !signedUp.includes(p));
  // Hosts matter for members who cannot already run sessions by role.
  const hostable = members.items.filter(
    (m) => m.status === 'active' && !roleAllows(m.role, 'session.manage'),
  );

  const nights = occurrences.items
    .filter((o) => o.seriesId === seriesId && o.state !== 'cancelled')
    .map((o) => ({ ...o, now: isHappeningNow(o), soon: isUpcoming(o) }));
  const ahead = nights
    .filter((o) => o.now || o.soon)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const past = nights.filter((o) => !o.now && !o.soon).slice(0, 6);

  const nextLine = preset?.activeOccurrenceId
    ? 'On now'
    : preset?.upcomingStartsAt
      ? `Set up for ${whenIn(preset.upcomingStartsAt, tz)}`
      : series.nextAt
        ? `Next ${whenIn(series.nextAt, tz)}`
        : 'No schedule yet';

  return (
    <Page
      title={series.name}
      eyebrow={org.kind === 'personal' ? 'Just me' : org.name}
      back={product === 'rally' ? '/dashboard' : '/sessions'}
      action={
        isClub && canInvite ? (
          <LinkButton href={`/sessions/${seriesId}/invite`} size="sm" variant="tonal">
            <Icon name="share" size={14} />
            Invite
          </LinkButton>
        ) : undefined
      }
    >
      <Card className="mb-5 space-y-3" tone={preset?.activeOccurrenceId ? 'live' : 'surface'}>
        <div>
          <div className="font-display text-[24px] font-bold uppercase leading-none">
            {nextLine}
          </div>
          <Muted className="mt-1 block">
            {series.schedule
              ? `${describeSchedule(series.schedule)} · ${series.schedule.timezone.replace('_', ' ')}`
              : 'Set a weekly day and time below and the next date appears here.'}
            {preset?.venueName
              ? ` · ${preset.venueName}, ${preset.courts} court${preset.courts === 1 ? '' : 's'}`
              : ''}
          </Muted>
        </div>
        {rating.count ? (
          <Muted className="block">
            {rating.average !== null
              ? `★ ${rating.average.toFixed(1)} from ${rating.count} rating${rating.count === 1 ? '' : 's'} over ${rating.nights} night${rating.nights === 1 ? '' : 's'}${topTags.length ? ` · ${topTags.join(', ')}` : ''}`
              : `${rating.count} rating${rating.count === 1 ? '' : 's'} so far · shown from 3`}
          </Muted>
        ) : null}
        {preset && canRun ? <SessionAction p={preset} /> : null}
        {!canRun ? (
          <Muted>Only the organisers and hosts of this session can start it.</Muted>
        ) : null}
      </Card>

      {ahead.length ? (
        <>
          <Kicker className="mb-2">Coming up</Kicker>
          <List>
            {ahead.map((o) => (
              <Row
                key={o.id}
                href={canRun ? `/sessions/${o.id}/players` : `/sessions/${o.id}/me`}
                title={whenIn(o.startsAt, tz)}
                subtitle={`${o.counts.checkedIn} here · ${o.counts.entries} expected`}
                right={<StateBadge state={o.now ? 'live' : o.state} />}
              />
            ))}
          </List>
          <div className="mb-5" />
        </>
      ) : null}

      {canEdit ? (
        <>
          <Kicker className="mb-2">Schedule</Kicker>
          <Card className="mb-5">
            <ActionForm
              action={saveSchedule.bind(null, seriesId, series.version)}
              submitLabel="Save schedule"
              variant="secondary"
              resetOnSuccess={false}
            >
              <div className="grid grid-cols-2 gap-3">
                <Field label="Every">
                  <Select name="weekday" defaultValue={series.schedule?.weekday.toString() ?? ''}>
                    <option value="">No schedule</option>
                    {[1, 2, 3, 4, 5, 6, 0].map((d) => (
                      <option key={d} value={d}>
                        {weekdayName(d)}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="At">
                  <Input name="time" type="time" defaultValue={series.schedule?.time ?? '19:30'} />
                </Field>
              </div>
              <TimezoneField fixed={series.schedule?.timezone} />
              <Field
                label="Check-in opens (minutes before)"
                hint="Players can check themselves in from then. Hosts can check anyone in at any time."
              >
                <Input
                  name="checkInWindowMinutes"
                  type="number"
                  min={0}
                  max={180}
                  defaultValue={series.checkInWindowMinutes}
                  inputMode="numeric"
                />
              </Field>
              {isClub ? (
                <label className="flex min-h-11 items-center justify-between gap-3 rounded-control bg-surface-2 px-3.5 text-sm">
                  <span>
                    <span className="block font-semibold">Hosts can run this session</span>
                    <span className="block text-xs text-muted">
                      Switch off to keep the list but take the ability away.
                    </span>
                  </span>
                  <input
                    type="checkbox"
                    name="hostsEnabled"
                    defaultChecked={series.hostsEnabled}
                    className="h-5 w-5"
                  />
                </label>
              ) : (
                <input type="hidden" name="hostsEnabled" value="on" />
              )}
            </ActionForm>
          </Card>
        </>
      ) : null}

      {isClub ? (
        <>
          <Kicker className="mb-2">Hosts · {hosts.items.length}</Kicker>
          <Card className="mb-5">
            <Muted className="mb-3 block">
              Hosts can set up and run any night of this session: open it ahead of time, tick who is
              coming and call the rounds. They cannot change the session itself.
              {!series.hostsEnabled ? ' Hosting is switched off at the moment.' : ''}
            </Muted>
            {canEdit ? (
              hostable.length ? (
                <ActionForm
                  action={saveHosts.bind(null, seriesId)}
                  submitLabel="Save hosts"
                  variant="primary"
                >
                  <ul className="divide-y divide-hairline">
                    {hostable.map((m) => (
                      <TickRow
                        key={m.profileId}
                        name="profileId"
                        value={m.profileId}
                        label={m.displayName}
                        checked={hostIds.has(m.profileId)}
                        avatarUrl={m.avatarUrl}
                      />
                    ))}
                  </ul>
                </ActionForm>
              ) : (
                <Muted>
                  Everyone in the club so far can already run sessions.{' '}
                  {canInvite ? (
                    <>
                      <Link
                        href={`/sessions/${seriesId}/invite`}
                        className="font-semibold text-primary"
                      >
                        Invite players
                      </Link>{' '}
                      and pick hosts from them here.
                    </>
                  ) : null}
                </Muted>
              )
            ) : hosts.items.length ? (
              <ul className="divide-y divide-hairline">
                {hosts.items.map((h) => (
                  <NameRow key={h.profileId} label={h.displayName} avatarUrl={h.avatarUrl} />
                ))}
              </ul>
            ) : (
              <Muted>No hosts yet.</Muted>
            )}
          </Card>
        </>
      ) : null}

      {canEdit || keepApart.items.length ? (
        <>
          <Kicker className="mb-2">Keep apart · {keepApart.items.length}</Kicker>
          <Card className="mb-5">
            <Muted className="mb-3 block">
              Pairs who never share a court. Copied onto every night as the players arrive; you can
              still change it on the night.
            </Muted>
            {keepApart.items.length ? (
              <ul className="mb-3 divide-y divide-hairline">
                {keepApart.items.map((k) => (
                  <li
                    key={`${k.participantA}:${k.participantB}`}
                    className="flex min-h-12 items-center justify-between gap-3 py-2"
                  >
                    <span className="text-[15px] font-semibold">
                      {k.displayNameA} <span className="text-muted">apart from</span>{' '}
                      {k.displayNameB}
                    </span>
                    {canEdit ? (
                      <form
                        action={removeKeepApart.bind(
                          null,
                          seriesId,
                          k.participantA,
                          k.participantB,
                        )}
                      >
                        <button type="submit" className="text-[13px] font-semibold text-danger">
                          Remove
                        </button>
                      </form>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : null}
            {canEdit && players.items.length >= 2 ? (
              <ActionForm
                action={addKeepApart.bind(null, seriesId)}
                submitLabel="Keep apart"
                variant="secondary"
              >
                <div className="grid grid-cols-2 gap-3">
                  <Field label="This player">
                    <Select name="participantA" defaultValue={players.items[0]?.id}>
                      {players.items.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.displayName}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Never with">
                    <Select name="participantB" defaultValue={players.items[1]?.id}>
                      {players.items.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.displayName}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>
              </ActionForm>
            ) : canEdit ? (
              <Muted>Add players first; pairs are picked from them.</Muted>
            ) : null}
          </Card>
        </>
      ) : null}

      <Kicker className="mb-2">Regulars · {regulars.items.length}</Kicker>
      <Card className="mb-5">
        <Muted className="mb-3 block">
          Everyone ticked is registered the moment a night is set up, so on the night you only mark
          who&apos;s here. Walk-ins can still be added as usual.
        </Muted>
        {canEdit ? (
          players.items.length ? (
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
                      <TickRow
                        key={p.id}
                        name="participantId"
                        value={p.id}
                        label={p.displayName}
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
                      <TickRow
                        key={p.id}
                        name="participantId"
                        value={p.id}
                        label={p.displayName}
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
                  <Link
                    href={`/sessions/${seriesId}/invite`}
                    className="font-semibold text-primary"
                  >
                    Invite them
                  </Link>{' '}
                  and they appear here, or add walk-ins by name on the night.
                </>
              ) : (
                'Add walk-ins by name on the night and they appear here.'
              )}
            </Muted>
          )
        ) : regulars.items.length ? (
          <ul className="divide-y divide-hairline">
            {regulars.items.map((r) => (
              <NameRow key={r.participantId} label={r.displayName} avatarUrl={r.avatarUrl} />
            ))}
          </ul>
        ) : (
          <Muted>No regulars yet.</Muted>
        )}
      </Card>

      {canEdit ? (
        <>
          <Kicker className="mb-2">Defaults</Kicker>
          <Card className="mb-5">
            <ActionForm
              action={updateSession.bind(null, seriesId, series.version)}
              submitLabel="Save"
              variant="secondary"
              resetOnSuccess={false}
            >
              <Field label="Name" hint="Tip: name it after the night, like Monday pickleball.">
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
              <Field
                label="Usual format"
                hint="Fair rotation mixes partners and shares the sitting out as evenly as it can. King of the court moves winners up and losers down; you record who won each round. Change it for any night before the first round."
              >
                <Select name="mode" defaultValue={usualMode}>
                  <option value="mix">Fair rotation</option>
                  <option value="king_of_the_court">King of the court</option>
                </Select>
              </Field>
              <Field
                label="Singles or doubles"
                hint="Change it for any night before the first round."
              >
                <Select name="format" defaultValue={usualFormat}>
                  <option value="doubles">Doubles</option>
                  <option value="singles">Singles</option>
                </Select>
              </Field>
              <details className="rounded-control bg-surface-2 px-3.5 py-2">
                <summary className="cursor-pointer text-[14px] font-semibold">
                  Advanced: how fairness is weighed
                </summary>
                <Muted className="mb-3 mt-1 block text-xs">
                  Each round the app weighs hundreds of possible line-ups. Turn a factor up to make
                  it matter more, or off to ignore it. The defaults suit most nights.
                </Muted>
                <div className="grid grid-cols-2 gap-3">
                  {FAIRNESS_FACTORS.map(([key, label]) => (
                    <Field key={key} label={label}>
                      <Select name={`weight_${key}`} defaultValue={levelOf(key)}>
                        {FAIRNESS_LEVELS.map((level) => (
                          <option key={level} value={level}>
                            {level.charAt(0).toUpperCase() + level.slice(1)}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  ))}
                  <Field label="Sitting out in a row">
                    <Select
                      name="maxConsecutiveRests"
                      defaultValue={rotation.maxConsecutiveRests?.toString() ?? ''}
                    >
                      <option value="">Avoid, but no hard limit</option>
                      <option value="1">Never twice in a row</option>
                      <option value="2">At most twice in a row</option>
                      <option value="3">At most three in a row</option>
                    </Select>
                  </Field>
                </div>
              </details>
            </ActionForm>
            <Muted className="mt-3 block text-xs">
              {preset?.venueName
                ? `${preset.venueName} · ${preset.courts} court${preset.courts === 1 ? '' : 's'}. Courts come from the venue; change them on the night.`
                : 'No venue set; courts are chosen on the night.'}
            </Muted>
          </Card>
        </>
      ) : null}

      {past.length ? (
        <>
          <Kicker className="mb-2">Past nights</Kicker>
          <List>
            {past.map((o) => (
              <Row
                key={o.id}
                href={`/sessions/${o.id}`}
                title={whenIn(o.startsAt, tz)}
                subtitle={`${o.counts.checkedIn} came · ${o.counts.rounds} round${o.counts.rounds === 1 ? '' : 's'}`}
                right={<StateBadge state={o.state} />}
              />
            ))}
          </List>
        </>
      ) : null}
    </Page>
  );
}
