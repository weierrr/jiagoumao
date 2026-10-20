import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "EDM Studio · Shopify 邮件工作台",
  description: "让每一次联系，都恰到好处。Shopify 单店邮件营销工作台。",
  robots: { index: false, follow: false },
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
