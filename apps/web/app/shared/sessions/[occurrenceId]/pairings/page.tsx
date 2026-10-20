import { ActionForm } from '../../../../../components/action-form';
import { Kicker } from '../../../../../components/rally-kit';
import {
  Card,
  Field,
  Icon,
  List,
  Muted,
  Row,
  Select,
  TextButton,
} from '../../../../../components/ui';
import { addPairLock, releasePairLock } from '../../actions';
import { loadSession, SessionFrame } from '../session-shell';

export const metadata = { title: 'Pairings' };

const LABEL: Record<'hard' | 'soft' | 'avoid', string> = {
  hard: 'Keep together',
  soft: 'Partners when it costs little',
  avoid: 'Keep apart',
};

/** Pairings (design B6): keep together, partners if easy, keep apart. Rules for tonight only. */
export default async function PairingsPage({
  params,
}: {
  params: Promise<{ occurrenceId: string }>;
}) {
  const { occurrenceId } = await params;
  const ctx = await loadSession(occurrenceId, '/pairings');
  const { board, canManage, checkedIn, live } = ctx;
  const name = (id: string) =>
    board.entries.find((e) => e.participantId === id)?.displayName ?? '?';

  return (
    <SessionFrame ctx={ctx}>
      <p className="mb-3 text-[14px] leading-6 text-ink-2">
        Rules for tonight only. Keep-apart is honoured above everything else: those two never share
        a court, as partners or opponents.
      </p>
      {board.pairLocks.length ? (
        <List>
          {board.pairLocks.map((l) => (
            <Row
              key={l.id}
              leading={
                <Icon
                  name={l.kind === 'avoid' ? 'x' : 'lock'}
                  size={20}
                  className={l.kind === 'avoid' ? 'text-danger' : 'text-muted'}
                />
              }
              title={`${name(l.participantA)} ${l.kind === 'avoid' ? 'apart from' : '&'} ${name(l.participantB)}`}
              subtitle={LABEL[l.kind]}
              right={
                canManage && live ? (
                  <form action={releasePairLock.bind(null, occurrenceId, l.id)}>
                    <TextButton danger>Release</TextButton>
                  </form>
                ) : undefined
              }
            />
          ))}
        </List>
      ) : (
        <Card tone="well">
          <Muted>No rules yet. Add one below once players are checked in.</Muted>
        </Card>
      )}

      {canManage && live ? (
        checkedIn.length >= 2 ? (
          <>
            <Kicker className="mb-2 mt-5">Add a rule</Kicker>
            <Card>
              <ActionForm
                action={addPairLock.bind(null, occurrenceId)}
                submitLabel="Save rule"
                variant="primary"
              >
                <Field label="Player">
                  <Select name="participantA">
                    {checkedIn.map((e) => (
                      <option key={e.participantId} value={e.participantId}>
                        {e.displayName}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Rule">
                  <Select name="kind" defaultValue="avoid">
                    <option value="avoid">Keep apart</option>
                    <option value="hard">Keep together as partners</option>
                    <option value="soft">Partners when it costs little</option>
                  </Select>
                </Field>
                <Field
                  label="With"
                  hint="Several people? Save one rule, then add the next; each shows in the list above."
                >
                  <Select name="participantB" defaultValue={checkedIn[1]?.participantId}>
                    {checkedIn.map((e) => (
                      <option key={e.participantId} value={e.participantId}>
                        {e.displayName}
                      </option>
                    ))}
                  </Select>
                </Field>
              </ActionForm>
            </Card>
          </>
        ) : (
          <Muted className="mt-4 block">Check at least two players in to add a rule.</Muted>
        )
      ) : null}
    </SessionFrame>
  );
}
