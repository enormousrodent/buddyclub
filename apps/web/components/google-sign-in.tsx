'use client';

import Script from 'next/script';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createSupabaseBrowserClient } from '../lib/supabase/client';
import { Alert } from './ui';

/*
 * Sign in with Google, branded as Buddy Club. Google's own button (Identity Services) returns an
 * ID token, which Supabase accepts directly, so Google's prompt names the app and never the
 * Supabase host. A random nonce is hashed for Google and sent raw to Supabase, which checks the
 * two match (replay protection). Google reports the email as verified, so an existing email-link
 * account with the same address is the same account.
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

const hex = (bytes: ArrayLike<number>) =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return hex(new Uint8Array(digest));
}

export function GoogleSignIn({ clientId, next }: { clientId: string; next: string }) {
  const slot = useRef<HTMLDivElement>(null);
  const nonce = useRef('');
  const rendered = useRef(false);
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
    const dark =
      getComputedStyle(document.documentElement).colorScheme === 'dark' ||
      (!document.documentElement.dataset['theme'] &&
        window.matchMedia('(prefers-color-scheme: dark)').matches);
    google.accounts.id.initialize({
      client_id: clientId,
      nonce: await sha256Hex(nonce.current),
      callback: onCredential,
      ux_mode: 'popup',
      context: 'signin',
      use_fedcm_for_prompt: true,
    });
    google.accounts.id.renderButton(parent, {
      theme: dark ? 'filled_black' : 'outline',
      size: 'large',
      shape: 'pill',
      text: 'continue_with',
      logo_alignment: 'left',
      width: Math.min(400, parent.clientWidth || 320),
    });
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
        ref={slot}
        className={`flex min-h-11 justify-center ${busy ? 'pointer-events-none opacity-60' : ''}`}
        aria-busy={busy}
      />
      {error ? <Alert tone="danger">{error}</Alert> : null}
    </div>
  );
}
