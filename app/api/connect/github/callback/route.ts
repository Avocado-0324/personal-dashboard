import { NextRequest, NextResponse } from 'next/server';
import { encryptToken } from '@/lib/crypto';
import { cookies } from 'next/headers';
import { auth } from '@/lib/auth';

const ERROR_MESSAGES: Record<string, string> = {
  csrf_detected: 'GitHub 连接失败：安全验证失败，请重试',
  token_exchange_failed: 'GitHub 连接失败：无法获取访问令牌，请重试',
  user_fetch_failed: 'GitHub 连接失败：无法获取用户信息，请重试',
  callback_failed: 'GitHub 连接失败，请重试',
  invalid_request: 'GitHub 连接失败：请求无效，请重试',
  github_auth_failed: 'GitHub 连接失败，请重试',
};

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    
    if (!session?.user) {
      const signInUrl = new URL('/auth/signin', request.url);
      return NextResponse.redirect(signInUrl);
    }

    const searchParams = request.nextUrl.searchParams;
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');

    if (error) {
      console.error('GitHub OAuth error:', error);
      const settingsUrl = new URL('/settings', request.url);
      settingsUrl.searchParams.set('error', 'GitHub 连接失败，请重试');
      return NextResponse.redirect(settingsUrl);
    }

    if (!code || !state) {
      const settingsUrl = new URL('/settings', request.url);
      settingsUrl.searchParams.set('error', 'GitHub 连接失败：请求无效，请重试');
      return NextResponse.redirect(settingsUrl);
    }

    const cookieStore = await cookies();
    const storedState = cookieStore.get('github_oauth_state');

    if (!storedState || storedState.value !== state) {
      console.error('State mismatch - CSRF detected');
      const settingsUrl = new URL('/settings', request.url);
      settingsUrl.searchParams.set('error', 'GitHub 连接失败：安全验证失败，请重试');
      return NextResponse.redirect(settingsUrl);
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
      const settingsUrl = new URL('/settings', request.url);
      settingsUrl.searchParams.set('error', 'GitHub 连接失败：无法获取访问令牌，请重试');
      return NextResponse.redirect(settingsUrl);
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
      const settingsUrl = new URL('/settings', request.url);
      settingsUrl.searchParams.set('error', 'GitHub 连接失败：无法获取用户信息，请重试');
      return NextResponse.redirect(settingsUrl);
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

    const settingsUrl = new URL('/settings', request.url);
    settingsUrl.searchParams.set('success', 'github_connected');
    return NextResponse.redirect(settingsUrl);
  } catch (error) {
    console.error('GitHub OAuth callback error:', error);
    const settingsUrl = new URL('/settings', request.url);
    settingsUrl.searchParams.set('error', 'GitHub 连接失败，请重试');
    return NextResponse.redirect(settingsUrl);
  }
}
