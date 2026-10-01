import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "我的聚合页 - 个人模块化仪表板",
  description: "个人聚合看板：邮件待办、育儿提示、GitHub活跃度",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
