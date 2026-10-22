import { RallyLanding } from '../../../components/rally-marketing';

export const metadata = {
  title: { absolute: 'Buddy Club' },
  description:
    'Buddy Club runs racket-sport sessions: fair rotations, live court boards, one timer, buddies, leagues and tournaments.',
};

/** Rally front page (signed-out; the proxy sends signed-in visitors to /dashboard). */
export default function RallyFrontPage() {
  return <RallyLanding />;
}
