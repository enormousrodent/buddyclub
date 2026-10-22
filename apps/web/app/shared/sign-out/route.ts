import { NextResponse, type NextRequest } from 'next/server';
import { createSupabaseServerClient } from '../../../lib/supabase/server';

/** Legacy device cookies from the first Rally onboarding; cleared so nothing lingers. */
const LEGACY_COOKIES = ['rally-onboarded', 'rally-role', 'rally-sports'];

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  const response = NextResponse.redirect(new URL('/', new URL(request.url).origin), {
    status: 303,
  });
  for (const name of LEGACY_COOKIES) response.cookies.set(name, '', { path: '/', maxAge: 0 });
  return response;
}
