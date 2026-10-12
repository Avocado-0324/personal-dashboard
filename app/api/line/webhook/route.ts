import { after } from 'next/server';
import { handleLineWebhook } from '@/lib/line/webhook';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  return handleLineWebhook(request, (job) => {
    after(job);
  });
}
