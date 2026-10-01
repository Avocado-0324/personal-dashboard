import { NextResponse } from 'next/server';
import { getGithubStatus } from '@/lib/connectors/github';

export async function GET() {
  const status = await getGithubStatus();
  
  return NextResponse.json({
    connected: status.ready,
    login: status.displayName || null,
  });
}
