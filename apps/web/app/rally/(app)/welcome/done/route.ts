import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { ONBOARDED_COOKIE } from '../cookies';

/** Marks onboarding complete (players skip the preset step) and lands on the dashboard. */
export async function GET(request: Request) {
  (await cookies()).set(ONBOARDED_COOKIE, '1', {
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
  });
  return NextResponse.redirect(new URL('/dashboard', request.url));
}
