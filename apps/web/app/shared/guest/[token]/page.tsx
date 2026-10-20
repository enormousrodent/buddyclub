import { Page } from '../../../../components/ui';
import { GuestView } from './guest-view';

export const metadata = { title: 'Guest access' };

export default async function GuestPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <Page title="Your schedule">
      <GuestView token={token} />
    </Page>
  );
}
