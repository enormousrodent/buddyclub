'use client';

import type { Round, RotationPreview } from '@buddyclub/shared-types';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { CourtCard, RestingStrip } from '../../../../components/court';
import { Alert, Badge, Button, Card, Muted } from '../../../../components/ui';
import { commitRotation, previewRotation } from '../actions';

export function AssignmentGrid({ round }: { round: Pick<Round, 'assignments' | 'resting'> }) {
  return (
    <div className="space-y-2.5">
      <div className="grid grid-cols-2 gap-2.5">
        {round.assignments.map((a) => (
          <CourtCard key={a.courtId} code={a.courtCode} teams={a.teams} />
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
          {pending ? 'Working…' : preview ? 'Shuffle again' : `Preview round ${nextSequence}`}
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
