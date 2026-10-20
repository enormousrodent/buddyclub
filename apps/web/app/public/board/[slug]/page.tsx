import { ApiError } from '@buddyclub/api-client';
import type { PublicBoard, PublicMeetBoard, PublicSessionBoard } from '@buddyclub/shared-types';
import { Countdown } from '../../../../components/live';
import { apiPublic } from '../../../../lib/api';
import { BoardRefresh } from './refresh';

export const metadata = { title: 'Live board' };

/**
 * Venue screen: the night-court theme at TV size. Read-only, polls the public projection every
 * few seconds, never needs a sign-in (ADR-016).
 */
export default async function BoardPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  let board: PublicBoard;
  try {
    board = await apiPublic().public.board(slug);
  } catch (error) {
    const missing = error instanceof ApiError && error.status === 404;
    return (
      <Shell>
        <div className="flex min-h-dvh flex-col items-center justify-center gap-3 text-center">
          <div className="font-display text-4xl font-bold">
            {missing ? 'This board is switched off' : 'Board unavailable'}
          </div>
          <div className="text-night-muted">
            {missing
              ? 'The organiser can turn it back on from the session or meet page.'
              : 'Trying again shortly.'}
          </div>
          <BoardRefresh intervalMs={15_000} />
        </div>
      </Shell>
    );
  }
  return (
    <Shell>
      <BoardRefresh intervalMs={6_000} />
      {board.kind === 'session' ? <SessionBoard board={board} /> : <MeetBoard board={board} />}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-dvh bg-night px-6 py-6 text-night-ink md:px-10 md:py-8">{children}</main>
  );
}

function Header({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle: string;
  right?: React.ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <div className="text-sm font-bold uppercase tracking-[0.08em] text-night-muted">
          {subtitle}
        </div>
        <h1 className="font-display text-4xl font-bold md:text-5xl">{title}</h1>
      </div>
      {right}
    </header>
  );
}

function Live({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-live px-4 py-2 text-base font-bold text-live-ink">
      <span className="h-2.5 w-2.5 rounded-full bg-live-ink" aria-hidden />
      {children}
    </span>
  );
}

function CourtTile({
  code,
  sides,
  label,
  highlight = false,
}: {
  code: string;
  sides: string[][];
  label?: string | null;
  highlight?: boolean;
}) {
  return (
    <div
      className={`flex min-h-44 flex-col gap-2 rounded-sheet p-5 ${
        highlight ? 'bg-night-surface outline-2 outline-live' : 'bg-night-surface'
      }`}
    >
      <div className="flex items-baseline justify-between">
        <span className="font-display text-7xl font-extrabold leading-none tracking-[-0.04em]">
          {code}
        </span>
        <span className="text-xs font-bold uppercase tracking-[0.08em] text-night-muted">
          {label ?? 'court'}
        </span>
      </div>
      {sides.length ? (
        <>
          <div className="text-2xl font-bold leading-tight">{sides[0]?.join(' & ')}</div>
          <div className="text-sm text-night-muted">vs</div>
          <div className="text-2xl font-bold leading-tight">{sides[1]?.join(' & ')}</div>
        </>
      ) : (
        <div className="text-xl text-night-muted">Free</div>
      )}
    </div>
  );
}

function SessionBoard({ board }: { board: PublicSessionBoard }) {
  return (
    <>
      <Header
        title={board.name}
        subtitle={`${board.organisationName}${board.venueName ? ` · ${board.venueName}` : ''}`}
        right={
          board.round ? (
            <div className="flex items-center gap-5">
              <div className="text-right">
                <div className="text-sm font-bold uppercase tracking-[0.08em] text-night-muted">
                  Round {board.round.sequenceNo}
                </div>
                <div className="text-night-ink [&_span]:text-6xl [&_span]:text-night-ink">
                  <Countdown
                    timer={board.round.timer}
                    serverTime={board.serverTime}
                    status={board.round.status}
                  />
                </div>
              </div>
              {board.round.status === 'in_progress' ? <Live>Live</Live> : null}
            </div>
          ) : (
            <span className="text-night-muted">{board.playersHere} players here</span>
          )
        }
      />
      {board.courts.length ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {board.courts.map((c) => (
            <CourtTile key={c.code} code={c.code} sides={c.sides} />
          ))}
        </div>
      ) : (
        <div className="rounded-sheet bg-night-surface p-10 text-center text-2xl text-night-muted">
          {board.state === 'completed'
            ? 'Session finished. Thanks for playing.'
            : 'Waiting for the first round.'}
        </div>
      )}
      {board.resting.length ? (
        <div className="mt-4 rounded-card bg-night-surface px-5 py-4 text-xl">
          <span className="mr-3 text-xs font-bold uppercase tracking-[0.08em] text-night-muted">
            Resting
          </span>
          {board.resting.join(', ')}
        </div>
      ) : null}
      {board.next ? (
        <section className="mt-8">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-[0.08em] text-night-muted">
            Next · round {board.next.sequenceNo}
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {board.next.courts.map((c) => (
              <div key={c.code} className="rounded-card bg-night-surface/60 p-4">
                <div className="font-display text-3xl font-extrabold">{c.code}</div>
                <div className="text-base font-semibold">{c.sides[0]?.join(' & ')}</div>
                <div className="text-xs text-night-muted">vs</div>
                <div className="text-base font-semibold">{c.sides[1]?.join(' & ')}</div>
              </div>
            ))}
          </div>
          {board.next.resting.length ? (
            <div className="mt-2 text-night-muted">Resting: {board.next.resting.join(', ')}</div>
          ) : null}
        </section>
      ) : null}
    </>
  );
}

function MeetBoard({ board }: { board: PublicMeetBoard }) {
  const rounds = [...new Set(board.knockout.map((k) => k.round))].sort((a, b) => a - b);
  return (
    <>
      <Header
        title={board.name}
        subtitle={`${board.competitionName} · ${board.organisationName}${board.venueName ? ` · ${board.venueName}` : ''}`}
        right={board.state === 'live' ? <Live>In play</Live> : null}
      />
      <section>
        <h2 className="mb-3 text-sm font-bold uppercase tracking-[0.08em] text-night-muted">
          Now playing
        </h2>
        {board.nowPlaying.length ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {board.nowPlaying.map((c, i) => (
              <CourtTile key={`${c.code}-${i}`} code={c.code} sides={c.sides} label={c.label} />
            ))}
          </div>
        ) : (
          <div className="rounded-card bg-night-surface p-6 text-xl text-night-muted">
            No rubber on court right now.
          </div>
        )}
      </section>
      {board.upNext.length ? (
        <section className="mt-8">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-[0.08em] text-night-muted">
            Up next
          </h2>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {board.upNext.map((u, i) => (
              <div key={i} className="rounded-card bg-night-surface/60 px-4 py-3">
                <div className="text-xs font-bold uppercase tracking-[0.06em] text-night-muted">
                  {u.division ? `${u.division} · ` : ''}
                  {u.label}
                </div>
                <div className="text-lg font-semibold">
                  {u.home} <span className="text-night-muted">v</span> {u.away}
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}
      {rounds.length ? (
        <section className="mt-8">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-[0.08em] text-night-muted">
            Knockout
          </h2>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {rounds.map((r) => {
              const ties = board.knockout.filter((k) => k.round === r);
              return (
                <div key={r} className="space-y-2">
                  <div className="text-base font-bold">{ties[0]?.label}</div>
                  {ties.map((t) => (
                    <div
                      key={`${t.round}-${t.slot}`}
                      className={`rounded-card px-4 py-3 ${t.status === 'in_progress' ? 'bg-night-surface outline-2 outline-live' : 'bg-night-surface/60'}`}
                    >
                      <div
                        className={`text-lg font-semibold ${t.winner && t.winner === t.home ? 'text-live' : ''}`}
                      >
                        {t.home ?? 'TBC'}
                      </div>
                      <div
                        className={`text-lg font-semibold ${t.winner && t.winner === t.away ? 'text-live' : ''}`}
                      >
                        {t.away ?? 'TBC'}
                      </div>
                      {t.score ? <div className="text-xs text-night-muted">{t.score}</div> : null}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </section>
      ) : null}
      {board.divisions.length ? (
        <section className="mt-8">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-[0.08em] text-night-muted">
            Standings
          </h2>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {board.divisions.map((d) => (
              <div key={d.name} className="rounded-card bg-night-surface p-4">
                <div className="mb-2 flex items-baseline justify-between">
                  <div className="text-base font-bold">{d.name}</div>
                  <div className="text-xs text-night-muted">
                    {d.courts.length ? `courts ${d.courts.join(', ')}` : ''}
                    {d.pendingFixtures ? ` · ${d.pendingFixtures} to play` : ''}
                  </div>
                </div>
                <table className="tnum w-full text-base">
                  <tbody>
                    {d.rows.map((r) => (
                      <tr key={r.team} className={r.tied ? 'text-warning-ink' : ''}>
                        <td className="w-6 pr-2 text-night-muted">{r.rank}</td>
                        <td className="truncate font-semibold">{r.team}</td>
                        <td className="w-10 text-right">{r.won}</td>
                        <td className="w-14 text-right text-night-muted">
                          {r.difference > 0 ? `+${r.difference}` : r.difference}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </>
  );
}
