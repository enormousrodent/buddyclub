'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Alert, Button, Field, Input, Muted } from '../../../components/ui';
import { createSupabaseBrowserClient } from '../../../lib/supabase/client';

type Mode = 'code' | 'password' | 'signup';

/** Supabase projects choose their own code length (Authentication > Sign in / Providers > Email). */
const MIN_CODE = 6;
const MAX_CODE = 10;

/**
 * Sign-in (design A2) and the "check your email" state (A3). A code by email, for
 * sign-in and for account creation alike:
 * corporate mail scanners pre-open links and burn them, a code typed into this screen cannot be
 * burnt by anyone but the person holding it. A password and account creation sit behind one link
 * so the first screen asks for one thing.
 */
export function SignInForm({ next, rally = false }: { next: string; rally?: boolean }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('code');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<'code' | 'confirm' | null>(null);

  async function send(kind: 'code' | 'confirm') {
    const supabase = createSupabaseBrowserClient();
    if (kind === 'code') {
      // No redirect: the email carries a code, not a link, so there is nothing to pre-open.
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { shouldCreateUser: true },
      });
      if (error) throw error;
    } else {
      // Also a code: Supabase sends new addresses the sign-up template whichever flow asked.
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName } },
      });
      if (error) throw error;
      if (data.session) {
        router.replace(next);
        router.refresh();
        return;
      }
    }
    setCode('');
    setSent(kind);
  }

  async function verify() {
    const token = code.replace(/\D/g, '');
    if (token.length < MIN_CODE) throw new Error('Type the whole code from the email');
    const { error } = await createSupabaseBrowserClient().auth.verifyOtp({
      email,
      token,
      type: sent === 'confirm' ? 'signup' : 'email',
    });
    if (error) throw error;
    // Full navigation so the server sees the new session cookies on the first render.
    window.location.assign(next);
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (sent) await verify();
      else if (mode === 'password') {
        const { error } = await createSupabaseBrowserClient().auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        router.replace(next);
        router.refresh();
      } else if (mode === 'signup') await send('confirm');
      else await send('code');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sign-in failed');
    } finally {
      setBusy(false);
    }
  }

  const resend = (
    <Button
      type="button"
      variant="ghost"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        setError(null);
        try {
          await send(sent ?? 'code');
        } catch (e) {
          setError(e instanceof Error ? e.message : 'Could not resend');
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? 'Sending…' : 'Send a new code'}
    </Button>
  );

  if (sent)
    return (
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <div className="text-center">
          <h2
            className={`font-display text-[32px] font-bold leading-none ${rally ? 'uppercase' : ''}`}
          >
            Check your email
          </h2>
          <p className="mx-auto mt-2 max-w-xs text-[15px] leading-6 text-ink-2">
            We sent a code to <strong className="text-ink">{email}</strong>. Type it here.
          </p>
        </div>
        <Field label="Code">
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, MAX_CODE))}
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            maxLength={MAX_CODE}
            placeholder="12345678"
            className="text-center font-display text-[26px] tracking-[0.2em]"
            autoFocus
            required
          />
        </Field>
        {error ? <Alert tone="danger">{error}</Alert> : null}
        <Button
          type="submit"
          size="lg"
          className={`w-full ${rally ? 'font-display text-[20px] uppercase tracking-[0.06em]' : ''}`}
          disabled={busy || code.length < MIN_CODE}
        >
          {busy ? 'Checking…' : 'Sign in'}
        </Button>
        <div className="flex flex-col gap-2">
          {resend}
          <Button type="button" variant="ghost" onClick={() => setSent(null)}>
            Use a different address
          </Button>
        </div>
        <Muted className="block text-center text-xs">
          Codes last an hour. Nothing to click, so a mail scanner cannot use it up.
        </Muted>
      </form>
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
      {mode !== 'code' ? (
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
          : mode === 'code'
            ? 'Email me a code'
            : mode === 'password'
              ? 'Sign in'
              : 'Create account'}
      </Button>
      <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-[13px] font-semibold">
        {mode !== 'code' ? (
          <button type="button" className="text-primary" onClick={() => setMode('code')}>
            Email me a code instead
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
        By continuing you agree to the{' '}
        <Link href="/terms" className="font-semibold text-ink underline underline-offset-2">
          terms
        </Link>{' '}
        and{' '}
        <Link href="/privacy" className="font-semibold text-ink underline underline-offset-2">
          privacy policy
        </Link>
        .
      </Muted>
    </form>
  );
}
