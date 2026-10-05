import { NextRequest, NextResponse } from 'next/server';
import { encryptToken } from '@/lib/crypto';
import { cookies } from 'next/headers';
import { auth } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    
    if (!session?.user) {
      return NextResponse.redirect(`${process.env.NEXTAUTH_URL}/auth/signin?error=未登录`);
    }

    const searchParams = request.nextUrl.searchParams;
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');

    if (error) {
      console.error('GitHub OAuth error:', error);
      return NextResponse.redirect(`${process.env.NEXTAUTH_URL}/settings?error=github_auth_failed`);
    }

    if (!code || !state) {
      return NextResponse.redirect(`${process.env.NEXTAUTH_URL}/settings?error=invalid_request`);
    }

    const cookieStore = await cookies();
    const storedState = cookieStore.get('github_oauth_state');

    if (!storedState || storedState.value !== state) {
      console.error('State mismatch - CSRF detected');
      return NextResponse.redirect(`${process.env.NEXTAUTH_URL}/settings?error=csrf_detected`);
    }

    cookieStore.delete('github_oauth_state');

    const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        client_id: process.env.GITHUB_CLIENT_ID!,
        client_secret: process.env.GITHUB_CLIENT_SECRET!,
        code,
      }),
    });

    const tokenData = await tokenResponse.json();

    if (tokenData.error || !tokenData.access_token) {
      console.error('GitHub token exchange failed:', tokenData);
      return NextResponse.redirect(`${process.env.NEXTAUTH_URL}/settings?error=token_exchange_failed`);
    }

    const userResponse = await fetch('https://api.github.com/user', {
      headers: {
        'Authorization': `Bearer ${tokenData.access_token}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });

    if (!userResponse.ok) {
      console.error('Failed to fetch GitHub user');
      return NextResponse.redirect(`${process.env.NEXTAUTH_URL}/settings?error=user_fetch_failed`);
    }

    const userData = await userResponse.json();

    const encryptedToken = encryptToken(tokenData.access_token);
    
    const githubData = JSON.stringify({
      token: encryptedToken,
      login: userData.login,
      id: userData.id,
    });

    cookieStore.set('pd_github_connection', githubData, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 365,
      path: '/',
    });

    cookieStore.delete('pd_github_disconnected');

    return NextResponse.redirect(`${process.env.NEXTAUTH_URL}/settings?success=github_connected`);
  } catch (error) {
    console.error('GitHub OAuth callback error:', error);
    return NextResponse.redirect(`${process.env.NEXTAUTH_URL}/settings?error=callback_failed`);
  }
}
