'use client';

import { RATING_POSITIVE_FROM, RATING_TAGS } from '@buddyclub/shared-types';
import { useActionState, useState } from 'react';
import type { ActionResult, FormAction } from './action-form';
import { Alert, Button } from './ui';

/**
 * Rate a night (Addendum 1.2 step 3): tap the stars, then tick what was good (3 stars and up)
 * or what was not. No text, ever. The score and tags go to the server action as form fields.
 */
export function RatingForm({ action }: { action: FormAction }) {
  const [score, setScore] = useState<number | null>(null);
  const [tags, setTags] = useState<Set<string>>(new Set());
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(action, {});
  const positive = score !== null && score >= RATING_POSITIVE_FROM;
  const options = score === null ? [] : positive ? RATING_TAGS.positive : RATING_TAGS.negative;

  const pick = (n: number) => {
    setScore(n);
    // Tags belong to a side; switching sides clears them.
    if (n >= RATING_POSITIVE_FROM !== positive) setTags(new Set());
  };
  const toggle = (id: string) =>
    setTags((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="score" value={score ?? ''} />
      {[...tags].map((t) => (
        <input key={t} type="hidden" name="tag" value={t} />
      ))}
      <div className="flex items-center justify-between gap-1" role="radiogroup" aria-label="Stars">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={score === n}
            aria-label={`${n} star${n === 1 ? '' : 's'}`}
            onClick={() => pick(n)}
            className={`flex h-14 flex-1 items-center justify-center rounded-control text-[34px] leading-none transition ${
              score !== null && n <= score ? 'text-primary' : 'text-hairline-strong'
            }`}
          >
            ★
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={() => pick(0)}
        className={`block w-full text-center text-[13px] font-semibold ${
          score === 0 ? 'text-danger' : 'text-muted'
        }`}
      >
        {score === 0 ? 'No stars. Sorry to hear it.' : 'No stars at all'}
      </button>
      {score !== null ? (
        <div>
          <div className="mb-2 text-[13px] font-bold uppercase tracking-[0.06em] text-muted">
            {positive ? 'What was good?' : "What wasn't?"}
          </div>
          <div className="flex flex-wrap gap-2">
            {options.map((t) => (
              <button
                key={t.id}
                type="button"
                aria-pressed={tags.has(t.id)}
                onClick={() => toggle(t.id)}
                className={`inline-flex min-h-10 items-center rounded-full border px-3.5 text-[14px] font-semibold ${
                  tags.has(t.id)
                    ? 'border-primary bg-primary text-primary-ink'
                    : 'border-hairline-strong text-ink'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      <Button type="submit" size="lg" className="w-full" disabled={score === null || pending}>
        {pending ? 'Sending…' : 'Done'}
      </Button>
      <p className="text-center text-xs text-muted">
        Hosts only ever see the overall picture, never who said what.
      </p>
    </form>
  );
}
