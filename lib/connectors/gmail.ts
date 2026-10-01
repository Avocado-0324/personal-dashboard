import { google } from 'googleapis';
import { auth } from '@/lib/auth';
import { cookies } from 'next/headers';

export type GmailConnectorStatus = {
  ready: boolean;
  displayName?: string;
  error?: string;
};

export type UnreadEmail = {
  id: string;
  from: string;
  subject: string;
  receivedAt: string;
  needsReply?: boolean;
  deepLink: string;
};

export async function getGmailStatus(): Promise<GmailConnectorStatus> {
  try {
    const cookieStore = await cookies();
    const disconnectedCookie = cookieStore.get('pd_gmail_disconnected');
    
    if (disconnectedCookie?.value === '1') {
      return { ready: false };
    }

    const session = await auth();
    
    const googleToken = (session as any)?.googleAccessToken || (session as any)?.accessToken;
    if (!session || !googleToken) {
      return { ready: false };
    }

    return {
      ready: true,
      displayName: session.user?.email || undefined,
    };
  } catch (error) {
    return {
      ready: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export async function fetchUnreadEmails(): Promise<{
  emails: UnreadEmail[];
  totalCount: number;
}> {
  const cookieStore = await cookies();
  const disconnectedCookie = cookieStore.get('pd_gmail_disconnected');
  
  if (disconnectedCookie?.value === '1') {
    throw new Error('Gmail disconnected');
  }

  const session = await auth();
  
  const googleToken = (session as any)?.googleAccessToken || (session as any)?.accessToken;
  if (!session || !googleToken) {
    throw new Error('Not authenticated');
  }

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );

  const googleRefreshToken = (session as any)?.googleRefreshToken || (session as any)?.refreshToken;
  oauth2Client.setCredentials({
    access_token: googleToken,
    refresh_token: googleRefreshToken,
  });

  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

  const listResponse = await gmail.users.messages.list({
    userId: 'me',
    q: 'in:inbox is:unread',
    maxResults: 5,
  });

  const messages = listResponse.data.messages || [];
  const totalCount = listResponse.data.resultSizeEstimate || 0;

  const emails: UnreadEmail[] = [];

  for (const message of messages) {
    if (!message.id) continue;

    const detail = await gmail.users.messages.get({
      userId: 'me',
      id: message.id,
      format: 'metadata',
      metadataHeaders: ['From', 'Subject', 'Date'],
    });

    const headers = detail.data.payload?.headers || [];
    const from = headers.find((h) => h.name === 'From')?.value || 'Unknown';
    const subject = headers.find((h) => h.name === 'Subject')?.value || '(No Subject)';
    const date = headers.find((h) => h.name === 'Date')?.value;

    const receivedAt = date ? new Date(date).toISOString() : new Date().toISOString();

    const needsReply = subject.toLowerCase().includes('re:') || 
                       subject.toLowerCase().includes('回复') ||
                       from.includes('team') ||
                       from.includes('support');

    const threadId = detail.data.threadId || message.id;
    const deepLink = `https://mail.google.com/mail/u/0/#inbox/${threadId}`;

    emails.push({
      id: message.id,
      from,
      subject,
      receivedAt,
      needsReply,
      deepLink,
    });
  }

  return { emails, totalCount };
}

export function getGmailInboxUrl(): string {
  return 'https://mail.google.com/mail/u/0/#search/is%3Aunread';
}
