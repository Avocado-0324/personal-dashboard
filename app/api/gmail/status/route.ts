import { NextResponse } from 'next/server';
import { getGmailStatus } from '@/lib/connectors/gmail';

export async function GET() {
  const status = await getGmailStatus();
  
  return NextResponse.json({
    connected: status.ready,
    email: status.displayName,
  });
}
