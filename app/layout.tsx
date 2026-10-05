import type { Metadata } from "next";
import { cookies } from "next/headers";
import "./globals.css";
import { Providers } from './providers';

export const metadata: Metadata = {
  title: "我的聚合页 - 个人模块化仪表板",
  description: "个人聚合看板：邮件待办、育儿提示、GitHub活跃度",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const themeCookie = cookieStore.get('theme');
  const theme = themeCookie?.value || 'dark';
  
  return (
    <html lang="zh-CN" className={theme === 'dark' || theme === 'system' ? 'dark' : ''}>
      <body className="antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
