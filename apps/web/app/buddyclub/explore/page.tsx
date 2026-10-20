import type { DiscoverQuery } from '@buddyclub/shared-types';
import { DiscoverBlocks, InterestChips } from '../../../components/discover';
import { Button, Icon, Input, Page } from '../../../components/ui';
import { apiPublic } from '../../../lib/api';

export const metadata = { title: 'Explore' };

export default async function ExplorePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; interest?: string; locality?: string }>;
}) {
  const { q, interest, locality } = await searchParams;
  const query: DiscoverQuery = {
    ...(q ? { q } : {}),
    ...(interest ? { interest } : {}),
    ...(locality ? { locality } : {}),
  };
  const result = await apiPublic().community.discover(query);
  return (
    <Page title="Explore" lead="Public groups and gatherings, by interest and place.">
      <form method="get" action="/explore" className="mb-3 flex flex-col gap-2">
        <div className="flex gap-2">
          <label htmlFor="q" className="sr-only">
            Search
          </label>
          <Input
            id="q"
            name="q"
            defaultValue={q ?? ''}
            placeholder="Search activities and groups"
          />
          <Button type="submit" variant="secondary" aria-label="Search">
            <Icon name="search" size={18} />
          </Button>
        </div>
        <div className="flex gap-2">
          <label htmlFor="locality" className="sr-only">
            Town or area
          </label>
          <Input
            id="locality"
            name="locality"
            defaultValue={locality ?? ''}
            placeholder="Town or area"
          />
          {interest ? <input type="hidden" name="interest" value={interest} /> : null}
        </div>
      </form>
      <div className="mb-4">
        <InterestChips interests={result.interests} current={interest} basePath="/explore" q={q} />
      </div>
      <DiscoverBlocks
        result={result}
        emptyHint="Nothing public matches yet. Try another category or place."
      />
    </Page>
  );
}
