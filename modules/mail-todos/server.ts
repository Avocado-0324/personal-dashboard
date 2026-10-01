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

  if (ctx.demoMode === 'normal' && ctx.connectors.gmail?.ready) {
    const mockData: MailTodosData = {
      totalCount: 3,
      items: [
        {
          id: '1',
          from: 'team@example.com',
          subject: '项目进度更新',
          receivedAt: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
          needsReply: true,
          deepLink: 'https://mail.google.com/mail/u/0/#inbox',
        },
        {
          id: '2',
          from: 'support@service.com',
          subject: '您的订单已发货',
          receivedAt: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
          deepLink: 'https://mail.google.com/mail/u/0/#inbox',
        },
        {
          id: '3',
          from: 'newsletter@tech.com',
          subject: '本周技术周刊',
          receivedAt: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(),
          deepLink: 'https://mail.google.com/mail/u/0/#inbox',
        },
      ],
    };

    return {
      status: 'ok',
      data: mockData,
      fetchedAt: new Date().toISOString(),
    };
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
