import { NextRequest, NextResponse } from 'next/server';
import { generateState } from '@/lib/crypto';
import { cookies } from 'next/headers';

export async function GET(request: NextRequest) {
  try {
    const state = generateState();
    
    const cookieStore = await cookies();
    cookieStore.set('github_oauth_state', state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 10,
      path: '/',
    });

    const params = new URLSearchParams({
      client_id: process.env.GITHUB_CLIENT_ID!,
      redirect_uri: `${process.env.NEXTAUTH_URL}/api/connect/github/callback`,
      scope: 'read:user user:email',
      state,
    });

    const authUrl = `https://github.com/login/oauth/authorize?${params.toString()}`;
    
    return NextResponse.redirect(authUrl);
  } catch (error) {
    console.error('GitHub OAuth start error:', error);
    const settingsUrl = new URL('/settings', request.url);
    settingsUrl.searchParams.set('error', 'github_start_failed');
    return NextResponse.redirect(settingsUrl);
  }
}
