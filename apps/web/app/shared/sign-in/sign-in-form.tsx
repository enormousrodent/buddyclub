'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Alert, Button, Field, Icon, Input, Muted } from '../../../components/ui';
import { createSupabaseBrowserClient } from '../../../lib/supabase/client';

type Mode = 'magic' | 'password' | 'signup';

/**
 * Sign-in (design A2) and the "check your email" state (A3). Email link first; a password and
 * account creation sit behind one link so the first screen asks for one thing.
 */
export function SignInForm({ next, rally = false }: { next: string; rally?: boolean }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('magic');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<'link' | 'confirm' | null>(null);

  async function send(kind: 'link' | 'confirm') {
    const supabase = createSupabaseBrowserClient();
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
    if (kind === 'link') {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: redirectTo },
      });
      if (error) throw error;
    } else {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: redirectTo, data: { full_name: fullName } },
      });
      if (error) throw error;
      if (data.session) {
        router.replace(next);
        router.refresh();
        return;
      }
    }
    setSent(kind);
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === 'password') {
        const { error } = await createSupabaseBrowserClient().auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        router.replace(next);
        router.refresh();
      } else if (mode === 'signup') await send('confirm');
      else await send('link');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sign-in failed');
    } finally {
      setBusy(false);
    }
  }

  if (sent)
    return (
      <div className="flex flex-col items-center gap-3 py-4 text-center">
        <span className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-tint text-tint-ink">
          <Icon name="check" size={28} />
        </span>
        <h2
          className={`font-display text-[32px] font-bold leading-none ${rally ? 'uppercase' : ''}`}
        >
          Check your email
        </h2>
        <p className="max-w-xs text-[15px] leading-6 text-ink-2">
          {sent === 'link' ? 'We sent a sign-in link to' : 'We sent a confirmation link to'}{' '}
          <strong className="text-ink">{email}</strong>. Open it on this phone.
        </p>
        <div className="mt-2 flex w-full flex-col gap-2">
          <Button
            type="button"
            variant="ghost"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                await send(sent);
              } catch (e) {
                setError(e instanceof Error ? e.message : 'Could not resend');
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? 'Sending…' : 'Resend the link'}
          </Button>
          <Button type="button" variant="ghost" onClick={() => setSent(null)}>
            Use a different address
          </Button>
        </div>
        {error ? <Alert tone="danger">{error}</Alert> : null}
      </div>
    );

  return (
    <form onSubmit={onSubmit} className="space-y-4">
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
          placeholder="you@example.com"
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
      <Button
        type="submit"
        size="lg"
        className={`w-full ${rally ? 'font-display text-[20px] uppercase tracking-[0.06em]' : ''}`}
        disabled={busy}
      >
        {busy
          ? 'Working…'
          : mode === 'magic'
            ? 'Send me a sign-in link'
            : mode === 'password'
              ? 'Sign in'
              : 'Create account'}
      </Button>
      <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-[13px] font-semibold">
        {mode !== 'magic' ? (
          <button type="button" className="text-primary" onClick={() => setMode('magic')}>
            Email me a link instead
          </button>
        ) : null}
        {mode !== 'password' ? (
          <button type="button" className="text-primary" onClick={() => setMode('password')}>
            Use a password
          </button>
        ) : null}
        {mode !== 'signup' ? (
          <button type="button" className="text-primary" onClick={() => setMode('signup')}>
            Create an account with a password
          </button>
        ) : null}
      </div>
      <Muted className="block text-center text-xs">
        By continuing you agree to the terms and privacy policy.
      </Muted>
    </form>
  );
}
