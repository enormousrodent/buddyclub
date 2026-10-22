import Link from 'next/link';
import { redirect } from 'next/navigation';
import { BuddyRow } from '../../../../components/buddy-row';
import {
  Avatar,
  Card,
  Empty,
  LinkButton,
  List,
  Muted,
  Page,
  Row,
  SectionHeading,
} from '../../../../components/ui';
import { apiForUser } from '../../../../lib/api';
import { nights } from '../../../../lib/days';
import { whenIn } from '../../../../lib/sessions';
import { getSessionUser } from '../../../../lib/supabase/server';

export const metadata = { title: 'Buddies' };

/**
 * Buddies (Addendum 1.4 step 3): the people you have checked in with, newest night first, plus
 * who said hi. Find me lives one tap away and is off until the person switches it on.
 */
export default async function BuddiesPage() {
  if (!(await getSessionUser())) redirect('/sign-in?next=/buddies');
  const api = apiForUser();
  const [buddies, hellos, profile] = await Promise.all([
    api.buddies.mine(),
    api.buddies.hellos(),
    api.profile.get(),
  ]);
  return (
    <Page
      title="Buddies"
      lead="The people you've played with. Say hi, see when they're free, find a game."
      action={
        <LinkButton href="/buddies/find" size="sm" variant="secondary">
          Find people
        </LinkButton>
      }
    >
      {hellos.items.length ? (
        <>
          <SectionHeading>Said hi to you</SectionHeading>
          <List>
            {hellos.items.map((h) => (
              <Row
                key={h.id}
                href={`/buddies/${h.from.profileId}`}
                leading={<Avatar name={h.from.displayName} src={h.from.avatarUrl} size={40} />}
                title={h.from.displayName}
                subtitle={`${whenIn(h.createdAt)}${h.sharedNights ? ` · ${nights(h.sharedNights)} together` : ''}`}
                right={
                  h.seenAt === null ? (
                    <span className="text-[12px] font-bold text-primary">New</span>
                  ) : undefined
                }
              />
            ))}
          </List>
        </>
      ) : null}

      <SectionHeading>Played with you</SectionHeading>
      {buddies.items.length ? (
        <List>
          {buddies.items.map((b) => (
            <BuddyRow key={b.profileId} b={b} />
          ))}
        </List>
      ) : (
        <Empty title="Nobody yet">
          Check in to a night and everyone on court with you appears here.
        </Empty>
      )}

      {!profile.discoverable ? (
        <Card className="mt-4">
          <div className="font-display text-[20px] font-bold uppercase leading-none">
            Looking for a game?
          </div>
          <Muted className="mt-1 block">
            Switch Find me on and people at your level nearby can find you, and you them. Adults
            only, off until you say so.
          </Muted>
          <Link
            href="/profile/buddy"
            className="mt-3 inline-flex min-h-10 items-center text-[14px] font-bold text-primary"
          >
            Find me settings
          </Link>
        </Card>
      ) : null}
    </Page>
  );
}
