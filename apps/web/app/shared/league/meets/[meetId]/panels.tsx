'use client';

import type { FixturePreview, ProgressionPreview } from '@buddyclub/shared-types';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { ActionForm } from '../../../../../components/action-form';
import { Alert, Button, Card, Field, Input, Muted } from '../../../../../components/ui';
import {
  advanceKnockout,
  commitProgression,
  previewFixtures,
  previewProgression,
  publishFixtures,
} from '../../actions';

export function PublishPanel({ meetId }: { meetId: string }) {
  const router = useRouter();
  const [preview, setPreview] = useState<FixturePreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <Card className="mb-4 space-y-3">
      <h2 className="font-semibold">Publish fixtures</h2>
      {preview ? (
        <div className="text-sm">
          <p>
            {preview.totals.fixtures} fixtures, {preview.totals.rubbers} rubbers
            {preview.knockout
              ? ` (${preview.knockout.fixtures} knockout ties for ${preview.knockout.entrants} qualifiers over ${preview.knockout.rounds} rounds)`
              : ''}
            .
          </p>
          {preview.divisions.map((d) => (
            <p key={d.divisionId}>
              <span className="font-medium">{d.divisionName}:</span>{' '}
              {d.fixtures.map((f) => `R${f.roundNo} ${f.home} v ${f.away}`).join(' · ') || 'none'}
            </p>
          ))}
          {preview.warnings.length ? (
            <Alert tone="warning">
              <ul>
                {preview.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </Alert>
          ) : null}
        </div>
      ) : null}
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <div className="flex gap-2">
        <Button
          type="button"
          variant="secondary"
          disabled={pending}
          onClick={() =>
            start(async () => {
              setError(null);
              const r = await previewFixtures(meetId);
              if (r.error) setError(r.error);
              else setPreview(r.preview ?? null);
            })
          }
        >
          Preview
        </Button>
        {preview && preview.totals.fixtures > 0 ? (
          <Button
            type="button"
            disabled={pending}
            onClick={() =>
              start(async () => {
                setError(null);
                try {
                  await publishFixtures(meetId);
                  router.refresh();
                } catch (e) {
                  setError(e instanceof Error ? e.message : 'Failed');
                }
              })
            }
          >
            Publish {preview.totals.fixtures} fixtures
          </Button>
        ) : null}
      </div>
    </Card>
  );
}

/** Fills knockout ties whose pools or feeder ties are decided; lists what is still waiting. */
export function AdvancePanel({ meetId, pendingCount }: { meetId: string; pendingCount: number }) {
  const router = useRouter();
  const [result, setResult] = useState<{ resolved: number; pending: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={pending}
          onClick={() =>
            start(async () => {
              setError(null);
              const r = await advanceKnockout(meetId);
              if (r.error) setError(r.error);
              else {
                setResult({ resolved: r.resolved ?? 0, pending: r.pending ?? [] });
                router.refresh();
              }
            })
          }
        >
          {pending ? 'Working…' : 'Fill the bracket'}
        </Button>
        <Muted>
          {pendingCount} tie{pendingCount === 1 ? '' : 's'} waiting. Ties fill themselves as results
          come in; this just checks again.
        </Muted>
      </div>
      {result ? (
        <Alert tone={result.resolved ? 'success' : 'info'}>
          {result.resolved} tie{result.resolved === 1 ? '' : 's'} filled.
          {result.pending.length ? (
            <ul className="mt-1 list-disc pl-4">
              {result.pending.slice(0, 8).map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          ) : null}
        </Alert>
      ) : null}
      {error ? <Alert tone="danger">{error}</Alert> : null}
    </div>
  );
}

function localDefault(days: number): string {
  const d = new Date(Date.now() + days * 86400000);
  d.setMinutes(0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T10:00`;
}

export function ProgressionPanel({ meetId }: { meetId: string }) {
  const [preview, setPreview] = useState<ProgressionPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <Card className="mt-6 space-y-3">
      <h2 className="font-semibold">Promotion and relegation</h2>
      <Muted>Preview the movement from this meet; nothing changes until you approve it.</Muted>
      {preview ? (
        <div className="text-sm">
          {preview.blockers.length ? (
            <Alert tone="warning">
              <ul>
                {preview.blockers.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            </Alert>
          ) : null}
          <ul>
            {preview.moves
              .filter((m) => m.direction !== 'stay')
              .map((m) => (
                <li key={m.teamId}>
                  {m.teamName}: {m.direction === 'up' ? 'promoted' : 'relegated'}
                </li>
              ))}
          </ul>
          {preview.moves.every((m) => m.direction === 'stay') && !preview.blockers.length ? (
            <p>No movement.</p>
          ) : null}
        </div>
      ) : null}
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <Button
        type="button"
        variant="secondary"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            const r = await previewProgression(meetId);
            if (r.error) setError(r.error);
            else setPreview(r.preview ?? null);
          })
        }
      >
        {preview ? 'Preview again' : 'Preview progression'}
      </Button>
      {preview && preview.blockers.length === 0 ? (
        <ActionForm
          action={commitProgression.bind(null, meetId, preview.progressionId)}
          submitLabel="Approve and create next meet"
          resetOnSuccess={false}
        >
          <Field label="Next meet name">
            <Input name="name" placeholder="Meet 2" required />
          </Field>
          <Field label="Next meet starts">
            <Input name="startsAt" type="datetime-local" defaultValue={localDefault(28)} required />
          </Field>
          <Field label="Note (optional)">
            <Input name="reason" maxLength={400} />
          </Field>
        </ActionForm>
      ) : null}
    </Card>
  );
}
