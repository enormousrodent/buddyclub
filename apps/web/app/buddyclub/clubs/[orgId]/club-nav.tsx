import { Tabs } from '../../../../components/ui';

export function ClubNav({
  orgId,
  current,
}: {
  orgId: string;
  current: 'overview' | 'sessions' | 'members' | 'players' | 'groups' | 'venues';
}) {
  const base = `/clubs/${orgId}`;
  const items = [
    { href: base, label: 'Overview', key: 'overview' },
    { href: `${base}/sessions`, label: 'Sessions', key: 'sessions' },
    { href: `${base}/members`, label: 'Members', key: 'members' },
    { href: `${base}/players`, label: 'Players', key: 'players' },
    { href: `${base}/groups`, label: 'Groups', key: 'groups' },
    { href: `${base}/venues`, label: 'Venues', key: 'venues' },
  ];
  const active = items.find((i) => i.key === current)?.href ?? base;
  return <Tabs items={items} current={active} />;
}
