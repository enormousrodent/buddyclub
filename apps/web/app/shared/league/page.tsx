import { roleAllows } from '@buddyclub/auth';
import { redirect } from 'next/navigation';
import { ActionForm } from '../../../components/action-form';
import {
  Card,
  Empty,
  Field,
  Input,
  LinkButton,
  List,
  Muted,
  Page,
  Row,
  SectionHeading,
  Select,
  StateBadge,
} from '../../../components/ui';
import { apiForUser } from '../../../lib/api';
import { getSessionUser } from '../../../lib/supabase/server';
import { createCompetition } from './actions';

export const metadata = { title: 'Competitions' };

export default async function LeaguePage() {
  if (!(await getSessionUser())) redirect('/sign-in?next=/league');
  const api = apiForUser();
  const [me, sports, mine] = await Promise.all([api.me(), api.sports(), api.competitions.mine()]);
  const orgs = me.memberships.filter((m) => m.status === 'active' && m.organisationKind === 'club');
  const myMeets = mine.meets.filter((m) => m.myFixtures.length > 0);
  const lists = await Promise.all(
    orgs.map(async (m) => ({
      membership: m,
      items: (await api.competitions.list(m.organisationId)).items,
    })),
  );

  return (
    <Page title="Competitions" back="/">
      {myMeets.length ? (
        <section className="mb-6">
          <SectionHeading>Your fixtures</SectionHeading>
          {myMeets.map((m) => (
            <Card key={m.meetId} className="mb-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-semibold">{m.name}</div>
                  <Muted>
                    {m.competitionName} · {new Date(m.startsAt).toLocaleDateString('en-GB')}
                    {m.venueName ? ` · ${m.venueName}` : ''}
                  </Muted>
                </div>
                <StateBadge state={m.state} />
              </div>
              <ul className="divide-y divide-hairline text-sm">
                {m.myFixtures.map((f) => (
                  <li key={f.fixtureId} className="flex items-center justify-between gap-2 py-2">
                    <div className="min-w-0">
                      <div className="truncate font-medium">
                        {f.myTeam} <span className="text-muted">vs</span> {f.opponent}
                      </div>
                      <Muted>
                        {f.label}
                        {f.myRubbers.length
                          ? ` · ${f.myRubbers.map((r) => `${r.label}${r.courtCode ? ` on court ${r.courtCode}` : ''}${r.score ? ` ${r.score}` : ''}`).join(', ')}`
                          : ''}
                      </Muted>
                    </div>
                    <StateBadge state={f.status} />
                  </li>
                ))}
              </ul>
              <LinkButton href={`/league/meets/${m.meetId}`} variant="ghost" size="sm">
                Open meet
              </LinkButton>
            </Card>
          ))}
        </section>
      ) : null}
      {orgs.length === 0 ? (
        <Empty title="No club competitions">
          Leagues and tournaments run inside a club. Join one, or create a club in Buddy Club.
        </Empty>
      ) : null}
      {lists.map(({ membership, items }) => (
        <section key={membership.organisationId} className="mb-6">
          <SectionHeading>{membership.organisationName}</SectionHeading>
          {items.length ? (
            <List>
              {items.map((c) => (
                <Row
                  key={c.id}
                  href={`/league/competitions/${c.id}`}
                  title={c.name}
                  subtitle={`${c.type} · ${c.sportId}`}
                />
              ))}
            </List>
          ) : (
            <Empty>No competitions yet.</Empty>
          )}
          {roleAllows(membership.role, 'competition.manage') ? (
            <Card className="mt-3">
              <ActionForm
                action={createCompetition.bind(null, membership.organisationId)}
                submitLabel="Create league"
              >
                <Field label="League name">
                  <Input name="name" placeholder="Regional League" required maxLength={160} />
                </Field>
                <Field label="Sport">
                  <Select name="sportId" defaultValue="badminton">
                    {sports.items.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              </ActionForm>
            </Card>
          ) : null}
        </section>
      ))}
    </Page>
  );
}
