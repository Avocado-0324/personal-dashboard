import { auth } from '@/lib/auth';
import { NextResponse } from 'next/server';

export default auth((req) => {
  if (!req.auth) {
    if (req.nextUrl.pathname.startsWith('/api/')) {
      return NextResponse.json(
        { error: '未登录' },
        { status: 401, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    const signInUrl = new URL('/auth/signin', req.url);
    return NextResponse.redirect(signInUrl);
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    '/((?!auth/signin|api/auth|api/connect/github/callback|api/portfolio/ingest|_next/static|_next/image|favicon.ico|.*\\.png|.*\\.jpg|.*\\.jpeg|.*\\.gif|.*\\.svg|.*\\.webp).*)',
  ],
};
