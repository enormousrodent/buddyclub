import { ActionForm } from '../../../../../components/action-form';
import { QrCode } from '../../../../../components/qr-code';
import { Kicker } from '../../../../../components/rally-kit';
import { Badge, Card, LinkButton, Muted } from '../../../../../components/ui';
import { absoluteUrl } from '../../../../../lib/links';
import { issueSessionGuestLink, setOccurrencePublicAccess } from '../../actions';
import { loadSession, SessionFrame } from '../session-shell';

export const metadata = { title: 'Share' };

/** Share (design B5): the join QR and code, the TV board, and guest links. */
export default async function SharePage({ params }: { params: Promise<{ occurrenceId: string }> }) {
  const { occurrenceId } = await params;
  const ctx = await loadSession(occurrenceId, '/share');
  const { board, canManage } = ctx;
  const slug = board.occurrence.publicSlug;
  const guests = board.entries.filter(
    (e) => e.source === 'guest' && e.attendanceStatus === 'checked_in',
  );

  return (
    <SessionFrame ctx={ctx}>
      <Card className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="font-display text-[24px] font-bold uppercase leading-none">
              Join tonight
            </div>
            <Muted className="mt-1 block">
              Players scan, type a name, and see their court on their own phone. No account needed.
            </Muted>
          </div>
          {canManage ? (
            <ActionForm
              action={setOccurrencePublicAccess.bind(null, occurrenceId, !slug)}
              submitLabel={slug ? 'Turn off' : 'Turn on'}
              variant={slug ? 'secondary' : 'primary'}
              size="sm"
              resetOnSuccess={false}
              className="space-y-0"
            />
          ) : null}
        </div>
        {slug ? (
          <>
            <QrCode url={await absoluteUrl(`/join/${slug}`)} caption="Scan to join" size={200} />
            <div className="flex items-end justify-between gap-3 rounded-control bg-surface-2 px-4 py-3">
              <div>
                <Kicker>Or type the code</Kicker>
                <div className="tnum font-display text-[40px] font-extrabold uppercase leading-none tracking-[0.08em]">
                  {slug}
                </div>
              </div>
              <Muted>rally.buddy-club.com/join</Muted>
            </div>
            <LinkButton href={`/board/${slug}`} variant="tonal" className="w-full">
              Show the board on a TV
            </LinkButton>
            <Muted>
              Open that link in the TV&apos;s browser, or cast the tab. It updates by itself.
            </Muted>
          </>
        ) : (
          <Muted>Joining by QR and the TV board are off for this session.</Muted>
        )}
      </Card>

      {canManage ? (
        <>
          <Kicker className="mb-2 mt-5">Guest links</Kicker>
          <Card>
            <Muted>
              A walk-in without an account can get a link that shows their court and the timer.
            </Muted>
            <div className="mt-2 space-y-2">
              {guests.map((e) => (
                <div
                  key={e.participantId}
                  className="flex items-center justify-between gap-2 text-sm"
                >
                  <span className="font-semibold">{e.displayName}</span>
                  <ActionForm
                    action={issueSessionGuestLink.bind(null, occurrenceId, e.participantId)}
                    submitLabel="Link"
                    variant="secondary"
                    size="sm"
                    resetOnSuccess={false}
                    className="space-y-0"
                  />
                </div>
              ))}
              {guests.length === 0 ? <Badge>No checked-in guests</Badge> : null}
            </div>
          </Card>
        </>
      ) : null}
    </SessionFrame>
  );
}
