import type { ModuleContext, ModuleLoadResult } from '@/lib/module-types';

export type MailTodosData = {
  totalCount: number;
  items: Array<{
    id: string;
    from: string;
    subject: string;
    receivedAt: string;
    needsReply?: boolean;
    deepLink: string;
  }>;
};

export async function load(ctx: ModuleContext): Promise<ModuleLoadResult<MailTodosData>> {
  // 检查 Gmail 连接状态
  if (!ctx.connectors.gmail?.ready) {
    return { status: 'disconnected', connector: 'gmail' };
  }

  // M0: 返回 mock 数据
  // M1+ 将接入真实 Gmail API
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
