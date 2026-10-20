import { headers } from 'next/headers';
import { MarketingFooter, RallyLanding } from '../../../components/marketing';
import { rallyOrigin } from '../../../lib/env';

export const metadata = {
  title: 'Rally',
  description:
    'Rally runs racket-sport sessions: fair rotations, live court boards, one timer, leagues and tournaments.',
};

/** Rally's front page while it lives on the Buddy Club host; later the Rally host's own home. */
export default async function RallyPage() {
  const h = await headers();
  return (
    <>
      <RallyLanding rallyUrl={rallyOrigin(h.get('host'), h.get('x-forwarded-proto'))} />
      <MarketingFooter />
    </>
  );
}
