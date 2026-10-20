'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Alert, Button, Field, Input } from '../../../components/ui';
import { createSupabaseBrowserClient } from '../../../lib/supabase/client';

type Mode = 'password' | 'magic' | 'signup';

export function SignInForm({ next }: { next: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const supabase = createSupabaseBrowserClient();
      const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
      if (mode === 'password') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.replace(next);
        router.refresh();
      } else if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: redirectTo, data: { full_name: fullName } },
        });
        if (error) throw error;
        if (data.session) {
          router.replace(next);
          router.refresh();
        } else {
          setNotice('Check your email to confirm your account, then sign in.');
        }
      } else {
        const { error } = await supabase.auth.signInWithOtp({
          email,
          options: { emailRedirectTo: redirectTo },
        });
        if (error) throw error;
        setNotice('Magic link sent. Open it on this device to sign in.');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sign-in failed');
    } finally {
      setBusy(false);
    }
  }

  const modes: { key: Mode; label: string }[] = [
    { key: 'password', label: 'Password' },
    { key: 'magic', label: 'Magic link' },
    { key: 'signup', label: 'Create account' },
  ];

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div role="tablist" className="flex gap-1 rounded-control bg-surface-2 p-1 text-sm">
        {modes.map((m) => (
          <button
            key={m.key}
            type="button"
            role="tab"
            aria-selected={mode === m.key}
            onClick={() => setMode(m.key)}
            className={`min-h-10 flex-1 rounded-[9px] px-2 font-semibold ${
              mode === m.key ? 'bg-surface text-ink shadow-raised' : 'text-muted'
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>
      {mode === 'signup' ? (
        <Field label="Your name">
          <Input
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            autoComplete="name"
            required
          />
        </Field>
      ) : null}
      <Field label="Email">
        <Input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          inputMode="email"
          required
        />
      </Field>
      {mode !== 'magic' ? (
        <Field label="Password">
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            minLength={8}
            required
          />
        </Field>
      ) : null}
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {notice ? <Alert tone="success">{notice}</Alert> : null}
      <Button type="submit" size="lg" className="w-full" disabled={busy}>
        {busy
          ? 'Working…'
          : mode === 'password'
            ? 'Sign in'
            : mode === 'magic'
              ? 'Send magic link'
              : 'Create account'}
      </Button>
    </form>
  );
}
