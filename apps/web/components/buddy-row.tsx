import { levelLabel, type BuddySummary } from '@buddyclub/shared-types';
import { nights } from '../lib/days';
import { whenIn } from '../lib/sessions';
import { Avatar, Row } from './ui';

/** One person in the buddies list or in search results. */
export function BuddyRow({ b }: { b: BuddySummary }) {
  const sports = b.sports
    .map((s) => {
      const level = s.level ? levelLabel(s.activityId, s.level) : null;
      return level ? `${s.activityName} (${level.toLowerCase()})` : s.activityName;
    })
    .join(', ');
  const played = b.sharedNights
    ? `${nights(b.sharedNights)} together${b.lastPlayedAt ? ` · last ${whenIn(b.lastPlayedAt)}` : ''}`
    : (b.locality ?? 'Found by Find me');
  return (
    <Row
      href={`/buddies/${b.profileId}`}
      leading={<Avatar name={b.displayName} src={b.avatarUrl} size={40} />}
      title={b.displayName}
      subtitle={`${played}${sports ? ` · ${sports}` : ''}`}
      right={
        b.hello.received ? (
          <span className="text-[12px] font-bold text-primary">Said hi</span>
        ) : b.hello.sent ? (
          <span className="text-[12px] font-semibold text-muted">Hi sent</span>
        ) : undefined
      }
    />
  );
}
