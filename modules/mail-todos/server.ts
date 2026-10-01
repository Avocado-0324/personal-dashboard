import type { ModuleContext, ModuleLoadResult } from '@/lib/module-types';
import type { MailTodosData } from './types';
import { fetchUnreadEmails } from '@/lib/connectors/gmail';

export async function load(ctx: ModuleContext): Promise<ModuleLoadResult<MailTodosData>> {
  if (!ctx.connectors.gmail?.ready) {
    return { status: 'disconnected', connector: 'gmail' };
  }

  if (ctx.demoMode === 'empty') {
    return { status: 'empty', hint: '收件箱无未读邮件（演示模式）' };
  }

  try {
    const { emails, totalCount } = await fetchUnreadEmails();

    if (emails.length === 0) {
      return { status: 'empty', hint: '收件箱无未读邮件' };
    }

    const data: MailTodosData = {
      totalCount,
      items: emails,
    };

    return {
      status: 'ok',
      data,
      fetchedAt: new Date().toISOString(),
    };
  } catch (error) {
    return {
      status: 'error',
      message: error instanceof Error ? error.message : '加载邮件失败',
      retryable: true,
    };
  }
}
