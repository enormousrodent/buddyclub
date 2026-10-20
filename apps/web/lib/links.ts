import { headers } from 'next/headers';

/** Absolute URL for a path on the host the current request came in on (server side only). */
export async function absoluteUrl(path: string): Promise<string> {
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000';
  const proto =
    h.get('x-forwarded-proto') ??
    (host.startsWith('localhost') || host.includes('.localhost') ? 'http' : 'https');
  return `${proto}://${host}${path.startsWith('/') ? path : `/${path}`}`;
}
