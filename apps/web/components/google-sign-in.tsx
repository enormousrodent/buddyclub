'use client';

import Script from 'next/script';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createSupabaseBrowserClient } from '../lib/supabase/client';
import { Alert } from './ui';

/*
 * Sign in with Google, branded as Buddy Club. Google's Identity Services button returns an ID
 * token, which Supabase accepts directly, so Google's prompt names the app and never the Supabase
 * host. A random nonce is hashed for Google and sent raw to Supabase, which checks the two match
 * (replay protection). Google reports the email as verified, so an existing email-link account
 * with the same address is the same account.
 *
 * Google's button cannot be restyled, so it is rendered transparent on top of our own button:
 * the person sees a Buddy Club control, the click lands on Google's. Both are the same size, so
 * the whole visible button is live.
 */

type GoogleId = {
  initialize(options: Record<string, unknown>): void;
  renderButton(parent: HTMLElement, options: Record<string, unknown>): void;
};

declare global {
  interface Window {
    google?: { accounts: { id: GoogleId } };
  }
}

/** Google's button is 40px tall at `size: large` and between 200 and 400px wide. */
const HEIGHT = 40;
const MAX_WIDTH = 400;

const hex = (bytes: ArrayLike<number>) =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return hex(new Uint8Array(digest));
}

function GoogleG({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden>
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}

export function GoogleSignIn({ clientId, next }: { clientId: string; next: string }) {
  const slot = useRef<HTMLDivElement>(null);
  const nonce = useRef('');
  const rendered = useRef(false);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onCredential = useCallback(
    async ({ credential }: { credential: string }) => {
      setBusy(true);
      setError(null);
      const { error } = await createSupabaseBrowserClient().auth.signInWithIdToken({
        provider: 'google',
        token: credential,
        nonce: nonce.current,
      });
      if (error) {
        setError(error.message);
        setBusy(false);
        return;
      }
      // Full navigation so the server sees the new session cookies on the first render.
      window.location.assign(next);
    },
    [next],
  );

  const render = useCallback(async () => {
    const google = window.google;
    const parent = slot.current;
    if (!google || !parent || rendered.current) return;
    rendered.current = true;
    nonce.current = hex(crypto.getRandomValues(new Uint8Array(32)));
    google.accounts.id.initialize({
      client_id: clientId,
      nonce: await sha256Hex(nonce.current),
      callback: onCredential,
      ux_mode: 'popup',
      context: 'signin',
      use_fedcm_for_prompt: true,
    });
    google.accounts.id.renderButton(parent, {
      theme: 'outline',
      size: 'large',
      shape: 'rectangular',
      text: 'continue_with',
      logo_alignment: 'left',
      width: Math.min(MAX_WIDTH, Math.max(200, parent.clientWidth || MAX_WIDTH)),
    });
    setReady(true);
  }, [clientId, onCredential]);

  // The script may already be on the page from an earlier visit; render as soon as it is there.
  useEffect(() => {
    void render();
  }, [render]);

  return (
    <div className="space-y-3">
      <Script
        src="https://accounts.google.com/gsi/client"
        strategy="afterInteractive"
        onReady={() => void render()}
      />
      <div
        className="relative mx-auto w-full"
        style={{ maxWidth: MAX_WIDTH, height: HEIGHT }}
        aria-busy={busy}
      >
        {/* What the person sees. */}
        <div
          className={`flex h-full w-full items-center justify-center gap-2.5 rounded-control border-[1.5px] border-hairline-strong bg-surface text-[15px] font-bold text-ink transition ${
            busy ? 'opacity-60' : ready ? '' : 'opacity-70'
          }`}
          aria-hidden
        >
          {busy ? (
            <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-ink/30 border-t-ink" />
          ) : (
            <GoogleG />
          )}
          {busy ? 'Signing you in…' : ready ? 'Continue with Google' : 'Loading Google…'}
        </div>
        {/* Google's real button, transparent, taking the click. */}
        <div
          ref={slot}
          className={`absolute inset-0 overflow-hidden opacity-0 ${busy ? 'pointer-events-none' : ''}`}
          style={{ height: HEIGHT }}
        />
      </div>
      {error ? <Alert tone="danger">{error}</Alert> : null}
    </div>
  );
}
