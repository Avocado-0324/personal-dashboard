import type { ForwardPayload } from './events';

const FORWARD_TIMEOUT_MS = 8000;

export async function forwardToGrokBot(
  url: string,
  key: string,
  payload: ForwardPayload
): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FORWARD_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
        'X-Automation-Key': key,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!response.ok) {
      console.error('GrokBot webhook failed', {
        status: response.status,
        groupId: payload.groupId,
      });
    }
  } catch (error) {
    const timedOut = error instanceof Error && error.name === 'AbortError';
    console.error('GrokBot webhook request failed', {
      reason: timedOut ? 'timeout' : 'network',
      groupId: payload.groupId,
    });
  } finally {
    clearTimeout(timeout);
  }
}
