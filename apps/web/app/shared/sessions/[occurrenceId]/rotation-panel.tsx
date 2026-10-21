'use client';

import type { Round, RotationPreview } from '@buddyclub/shared-types';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { CourtCard, RestingStrip } from '../../../../components/court';
import { Alert, Badge, Button, Card, Muted } from '../../../../components/ui';
import { commitRotation, previewRotation, recordResult } from '../actions';

/** "Who won?" on a court card: two taps, the recorded side stays lit, tap again to clear. */
function ResultButtons({
  occurrenceId,
  matchId,
  teams,
  winnerSide,
}: {
  occurrenceId: string;
  matchId: string;
  teams: Round['assignments'][number]['teams'];
  winnerSide: 1 | 2 | null;
}) {
  const label = (i: number) => teams[i]?.map((p) => p.displayName.split(' ')[0]).join(' & ') || '—';
  return (
    <div className="mt-1 grid grid-cols-2 gap-1.5">
      {([1, 2] as const).map((side) => (
        <form
          key={side}
          action={recordResult.bind(null, occurrenceId, matchId, winnerSide === side ? null : side)}
        >
          <button
            type="submit"
            aria-pressed={winnerSide === side}
            className={`w-full truncate rounded-control border px-2 py-1.5 text-[12px] font-bold ${
              winnerSide === side
                ? 'border-primary bg-primary text-primary-ink'
                : 'border-hairline-strong text-ink'
            }`}
          >
            {winnerSide === side ? '✓ ' : ''}
            {label(side - 1)}
          </button>
        </form>
      ))}
    </div>
  );
}

export function AssignmentGrid({
  round,
  occurrenceId,
  canRecord = false,
}: {
  round: Pick<Round, 'assignments' | 'resting'>;
  occurrenceId?: string;
  /** Show "who won" on each court (organisers and hosts, once a round is under way). */
  canRecord?: boolean;
}) {
  return (
    <div className="space-y-2.5">
      <div className="grid grid-cols-2 gap-2.5">
        {round.assignments.map((a) => (
          <CourtCard
            key={a.courtId}
            code={a.courtCode}
            teams={a.teams}
            footer={
              canRecord && occurrenceId && a.matchId ? (
                <ResultButtons
                  occurrenceId={occurrenceId}
                  matchId={a.matchId}
                  teams={a.teams}
                  winnerSide={a.winnerSide}
                />
              ) : a.winnerSide ? (
                <div className="mt-1 text-[12px] font-bold text-primary">
                  ✓ {a.teams[a.winnerSide - 1]?.map((p) => p.displayName).join(' & ')} won
                </div>
              ) : undefined
            }
          />
        ))}
      </div>
      <RestingStrip names={round.resting.map((p) => p.displayName)} />
    </div>
  );
}

/** Preview, inspect, then commit the next round. The commit is bound to the occurrence version. */
export function RotationPanel({
  occurrenceId,
  version,
  nextSequence,
  blocked,
}: {
  occurrenceId: string;
  version: number;
  nextSequence: number;
  blocked: string | null;
}) {
  const router = useRouter();
  const [preview, setPreview] = useState<RotationPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const stale = preview !== null && preview.sourceVersion !== version;

  return (
    <Card className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-[13px] font-bold uppercase tracking-[0.06em] text-muted">
          Round {nextSequence}
        </h2>
        {preview ? <Badge tone="info">preview</Badge> : null}
      </div>
      {blocked ? <Muted>{blocked}</Muted> : null}
      {preview ? (
        <>
          <AssignmentGrid round={preview} />
          {preview.warnings.length ? (
            <Alert tone="warning">
              <ul className="space-y-1">
                {preview.warnings.map((w) => (
                  <li key={`${w.code}-${w.detail}`}>{w.detail}</li>
                ))}
              </ul>
            </Alert>
          ) : null}
          {stale ? (
            <Alert tone="warning" title="The roster changed since this preview">
              Someone checked in or left. Generate a new one before publishing.
            </Alert>
          ) : null}
        </>
      ) : null}
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant={preview ? 'secondary' : 'primary'}
          size="lg"
          className={preview ? '' : 'w-full'}
          disabled={pending || !!blocked}
          onClick={() =>
            start(async () => {
              setError(null);
              const result = await previewRotation(occurrenceId);
              if (result.error) setError(result.error);
              else setPreview(result.preview ?? null);
            })
          }
        >
          {pending ? 'Working…' : preview ? 'Reshuffle' : `Call round ${nextSequence}`}
        </Button>
        {preview && preview.assignments.length > 0 ? (
          <Button
            type="button"
            size="lg"
            className="flex-1"
            disabled={pending || stale}
            onClick={() =>
              start(async () => {
                setError(null);
                const result = await commitRotation(occurrenceId, preview.previewId, version);
                if (result.error) setError(result.error);
                else {
                  setPreview(null);
                  router.refresh();
                }
              })
            }
          >
            Publish round {preview.sequenceNo}
          </Button>
        ) : null}
      </div>
    </Card>
  );
}
