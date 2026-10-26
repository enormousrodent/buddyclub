'use client';

import { useState, type FormEvent } from 'react';
import { Alert, Button, Field, Input } from '../../../../components/ui';
import { createSupabaseBrowserClient } from '../../../../lib/supabase/client';

const MIN = 8;

/** Sets or changes the password on the signed-in account, then goes on to `next`. */
export function PasswordForm({ next, rally }: { next: string; rally: boolean }) {
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (password.length < MIN) return setError(`At least ${MIN} characters`);
    if (password !== again) return setError('The two passwords do not match');
    setBusy(true);
    setError(null);
    const { error } = await createSupabaseBrowserClient().auth.updateUser({ password });
    if (error) {
      setError(error.message);
      setBusy(false);
      return;
    }
    window.location.assign(next);
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Field label="New password" hint={`At least ${MIN} characters.`}>
        <Input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          minLength={MIN}
          required
        />
      </Field>
      <Field label="Once more">
        <Input
          type="password"
          value={again}
          onChange={(e) => setAgain(e.target.value)}
          autoComplete="new-password"
          minLength={MIN}
          required
        />
      </Field>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <Button
        type="submit"
        size="lg"
        className={`w-full ${rally ? 'font-display text-[20px] uppercase tracking-[0.06em]' : ''}`}
        disabled={busy}
      >
        {busy ? 'Saving…' : 'Save password'}
      </Button>
    </form>
  );
}
