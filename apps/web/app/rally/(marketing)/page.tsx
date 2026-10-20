import { RallyLanding } from '../../../components/rally-marketing';

export const metadata = {
  title: { absolute: 'Rally' },
  description:
    'Rally runs racket-sport sessions: fair rotations, live court boards, one timer, leagues and tournaments.',
};

/** Rally front page (signed-out; the proxy sends signed-in visitors to /dashboard). */
export default function RallyFrontPage() {
  return <RallyLanding />;
}
