'use client';

import { ApiError, createApiClient } from '@buddyclub/api-client';
import type { GuestMe, GuestSession, MySchedule } from '@buddyclub/shared-types';
import { useEffect, useState } from 'react';
import { MyCourtHero } from '../../../../components/court';
import { Countdown } from '../../../../components/live';
import { Alert, Badge, Card, Icon, Muted } from '../../../../components/ui';

const STORAGE_KEY = 'buddyclub.guest.session';

function apiUrl() {
  return process.env['NEXT_PUBLIC_API_URL'] ?? 'http://127.0.0.1:4000';
}

type State =
  | { status: 'loading' }
  | { status: 'ready'; me: GuestMe; schedule: MySchedule | null }
  | { status: 'error'; message: string };

function NextCard({ game }: { game: MySchedule['next'] }) {
  return (
    <Card className="flex items-center gap-3">
      <span className="flex w-13 flex-col items-center">
        <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-muted">Next</span>
        <span className="font-display text-[30px] font-extrabold leading-8 tracking-tight">
          {game && !game.resting ? game.courtCode : '—'}
        </span>
      </span>
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-[15px] font-bold">
          {game ? `Round ${game.sequenceNo}${game.resting ? ' · resting' : ''}` : 'Next round'}
        </span>
        <Muted>
          {!game
            ? 'Not drawn yet. This page refreshes on its own.'
            : game.resting
              ? 'Sit this one out'
              : `${game.partners.length ? `with ${game.partners.map((p) => p.displayName).join(' & ')} · ` : ''}vs ${game.opponents.map((p) => p.displayName).join(' & ')}`}
        </Muted>
      </div>
    </Card>
  );
}

/**
 * Redeems a guest link once per device, keeps the short-lived credential in sessionStorage and
 * polls the guest's own schedule. Revoked or expired links show a clear message (ADR-008).
 */
export function GuestView({ token }: { token: string }) {
  const [state, setState] = useState<State>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function load() {
      const api = createApiClient({ baseUrl: apiUrl() });
      try {
        let session: GuestSession | null = null;
        try {
          const stored = sessionStorage.getItem(STORAGE_KEY);
          if (stored) {
            const parsed = JSON.parse(stored) as GuestSession & { linkToken?: string };
            if (parsed.linkToken === token && new Date(parsed.expiresAt).getTime() > Date.now())
              session = parsed;
          }
        } catch {
          session = null;
        }
        if (!session) {
          session = await api.guest.redeem(token);
          try {
            sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ ...session, linkToken: token }));
          } catch {
            // storage unavailable; continue with in-memory session
          }
        }
        const authed = createApiClient({
          baseUrl: apiUrl(),
          getAccessToken: () => session!.accessToken,
        });
        const me = await authed.guest.me();
        let schedule: MySchedule | null = null;
        try {
          schedule = await authed.guest.schedule();
        } catch (error) {
          if (!(error instanceof ApiError && error.status === 404)) throw error;
        }
        if (!cancelled) {
          setState({ status: 'ready', me, schedule });
          timer = setTimeout(load, 8000);
        }
      } catch (error) {
        const message =
          error instanceof ApiError
            ? (error.problem?.detail ?? error.problem?.title ?? 'This link is no longer valid.')
            : 'Could not reach the server.';
        if (!cancelled) setState({ status: 'error', message });
      }
    }
    void load();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [token]);

  if (state.status === 'loading')
    return (
      <div className="space-y-3" aria-busy="true">
        <div className="h-16 animate-pulse rounded-card bg-surface-2" />
        <div className="h-64 animate-pulse rounded-sheet bg-surface-2" />
        <Muted>Checking your link…</Muted>
      </div>
    );
  if (state.status === 'error')
    return (
      <Alert tone="danger" title={state.message}>
        Ask the organiser for a new link if you need one.
      </Alert>
    );
  const current = state.schedule?.current;
  return (
    <div className="space-y-3">
      <Card className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="truncate text-lg font-bold">{state.me.participant.displayName}</div>
          <Muted>
            {state.me.organisation.name}
            {state.schedule ? ` · ${state.schedule.occurrence.name}` : ''}
          </Muted>
        </div>
        <Badge>Guest</Badge>
      </Card>
      {state.schedule ? (
        <>
          {current ? (
            <MyCourtHero
              courtCode={current.courtCode}
              partners={current.partners.map((p) => p.displayName)}
              opponents={current.opponents.map((p) => p.displayName)}
              resting={current.resting}
              topLeft={`Now · round ${current.sequenceNo}`}
              topRight={
                <span className="tnum font-display text-2xl font-extrabold">
                  <Countdown
                    timer={current.timer}
                    serverTime={state.schedule.serverTime}
                    status={current.status}
                  />
                </span>
              }
            />
          ) : (
            <Card tone="ink" className="py-8 text-center">
              <div className="font-display text-2xl font-bold">No round in play</div>
              <div className="mt-1 text-on-ink-muted">
                Your court shows here when a round starts.
              </div>
            </Card>
          )}
          <NextCard game={state.schedule.next} />
        </>
      ) : (
        <Card>
          <p className="font-semibold">No session linked</p>
          <Muted>This link is not tied to a session night.</Muted>
        </Card>
      )}
      <p className="flex items-center justify-center gap-1.5 text-xs text-muted">
        <Icon name="clock" size={12} />
        Access ends {new Date(state.me.grantExpiresAt).toLocaleString('en-GB')}
      </p>
    </div>
  );
}
