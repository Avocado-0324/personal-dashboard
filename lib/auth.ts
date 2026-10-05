import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';

const ALLOWED_EMAIL = 'niqinou@gmail.com';

async function refreshGoogleAccessToken(refreshToken: string) {
  try {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
    });

    const tokens = await response.json();

    if (!response.ok) {
      throw new Error(tokens.error || 'Failed to refresh token');
    }

    return {
      accessToken: tokens.access_token,
      expiresAt: Math.floor(Date.now() / 1000) + tokens.expires_in,
      refreshToken: tokens.refresh_token ?? refreshToken,
    };
  } catch (error) {
    console.error('Error refreshing access token:', error);
    throw error;
  }
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          scope: 'openid email profile https://www.googleapis.com/auth/gmail.readonly',
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    }),
  ],
  callbacks: {
    async signIn({ user, account, profile }) {
      if (account?.provider === 'google') {
        const email = user.email || profile?.email;
        if (email !== ALLOWED_EMAIL) {
          return false;
        }
      }
      return true;
    },
    async jwt({ token, account, user }) {
      if (account && account.provider === 'google') {
        token.googleAccessToken = account.access_token;
        token.googleRefreshToken = account.refresh_token;
        token.googleExpiresAt = account.expires_at;
        token.email = user?.email;
      }

      if (token.googleExpiresAt && token.googleRefreshToken) {
        const shouldRefresh = (token.googleExpiresAt as number) * 1000 - Date.now() < 5 * 60 * 1000;
        
        if (shouldRefresh) {
          try {
            const refreshed = await refreshGoogleAccessToken(token.googleRefreshToken as string);
            token.googleAccessToken = refreshed.accessToken;
            token.googleExpiresAt = refreshed.expiresAt;
            token.googleRefreshToken = refreshed.refreshToken;
          } catch (error) {
            console.error('Failed to refresh token:', error);
          }
        }
      }

      return token;
    },
    async session({ session, token }) {
      if (token.googleAccessToken) {
        (session as any).googleAccessToken = token.googleAccessToken;
        (session as any).googleRefreshToken = token.googleRefreshToken;
        (session as any).googleExpiresAt = token.googleExpiresAt;
      }
      
      return session;
    },
  },
  pages: {
    signIn: '/auth/signin',
    error: '/auth/signin',
  },
});
