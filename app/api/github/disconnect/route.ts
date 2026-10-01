import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function POST() {
  const cookieStore = await cookies();
  
  cookieStore.set('pd_github_disconnected', '1', {
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
    httpOnly: true,
    sameSite: 'lax',
  });
  
  return NextResponse.json({ success: true });
}
