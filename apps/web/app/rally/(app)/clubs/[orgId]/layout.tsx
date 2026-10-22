import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { getSessionUser } from '../../../../../lib/supabase/server';

export default async function ClubLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = await params;
  if (!(await getSessionUser())) redirect(`/sign-in?next=${encodeURIComponent(`/clubs/${orgId}`)}`);
  return children;
}
