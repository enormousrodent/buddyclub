'use client';

import { useActionState, type ReactNode } from 'react';
import { CopyButton } from './copy-button';
import { Alert, Button } from './ui';

export interface ActionResult {
  error?: string;
  ok?: boolean;
  message?: string;
  /** A one-time link to show and share (invitation or guest link). */
  link?: string;
}

export type FormAction = (prev: ActionResult, formData: FormData) => Promise<ActionResult>;

/**
 * A form bound to a server action that returns `{ error }` or `{ ok, message, link }`.
 * Keeps forms on the server-components side simple: pass the action and the fields.
 */
export function ActionForm({
  action,
  submitLabel,
  children,
  variant = 'primary',
  size = 'md',
  className = '',
  resetOnSuccess = true,
}: {
  action: FormAction;
  submitLabel: string;
  children?: ReactNode;
  variant?: 'primary' | 'secondary' | 'danger' | 'tonal' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  resetOnSuccess?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <div className="space-y-3">
      <form
        action={formAction}
        className={`space-y-3 ${className}`}
        key={resetOnSuccess && state.ok ? `ok-${state.message ?? ''}-${state.link ?? ''}` : 'form'}
      >
        {children}
        <Button type="submit" variant={variant} size={size} disabled={pending}>
          {pending ? 'Working…' : submitLabel}
        </Button>
      </form>
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {state.ok && state.message ? <Alert tone="success">{state.message}</Alert> : null}
      {state.ok && state.link ? (
        <div className="flex items-center gap-2 rounded-control border border-hairline bg-surface p-2">
          <code className="min-w-0 flex-1 truncate text-xs">{state.link}</code>
          <CopyButton value={state.link} />
        </div>
      ) : null}
    </div>
  );
}
