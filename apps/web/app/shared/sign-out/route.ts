import { NextResponse, type NextRequest } from 'next/server';
import { createSupabaseServerClient } from '../../../lib/supabase/server';
import { ONBOARDED_COOKIE, ROLE_COOKIE, SPORTS_COOKIE } from '../../rally/(app)/welcome/cookies';

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  const response = NextResponse.redirect(new URL('/', new URL(request.url).origin), {
    status: 303,
  });
  // Onboarding state lives on the device; signing out resets it so the next account starts fresh.
  for (const name of [ONBOARDED_COOKIE, ROLE_COOKIE, SPORTS_COOKIE])
    response.cookies.set(name, '', { path: '/', maxAge: 0 });
  return response;
}
