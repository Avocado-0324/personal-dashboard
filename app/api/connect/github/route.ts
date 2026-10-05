import { NextRequest, NextResponse } from 'next/server';
import { generateState } from '@/lib/crypto';
import { cookies } from 'next/headers';
import { auth } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    
    if (!session?.user) {
      return NextResponse.json(
        { error: '未登录，请先使用 Google 登录' },
        { status: 401 }
      );
    }

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
    return NextResponse.json(
      { error: '启动 GitHub 认证失败' },
      { status: 500 }
    );
  }
}
