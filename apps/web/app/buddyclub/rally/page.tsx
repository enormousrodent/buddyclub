import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { rallyOrigin } from '../../../lib/env';

/** Rally has its own front page on its own host now; this path just sends people there. */
export default async function RallyRedirect() {
  const h = await headers();
  redirect(rallyOrigin(h.get('host'), h.get('x-forwarded-proto')));
}
