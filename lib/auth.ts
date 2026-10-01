import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';
import GitHub from 'next-auth/providers/github';

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
    GitHub({
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
      authorization: {
        params: {
          scope: 'read:user user:email',
        },
      },
    }),
  ],
  callbacks: {
    async jwt({ token, account, profile }) {
      if (account) {
        if (account.provider === 'google') {
          token.googleAccessToken = account.access_token;
          token.googleRefreshToken = account.refresh_token;
          token.googleExpiresAt = account.expires_at;
        } else if (account.provider === 'github') {
          token.githubAccessToken = account.access_token;
          token.githubLogin = (profile as any)?.login;
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
      
      if (token.githubAccessToken) {
        (session as any).githubAccessToken = token.githubAccessToken;
        (session as any).githubLogin = token.githubLogin;
      }
      
      return session;
    },
  },
  pages: {
    signIn: '/auth/signin',
  },
});
