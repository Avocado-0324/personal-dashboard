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
