import type { Metadata } from "next";
import "./globals.css";
import "./workspace.css";
import "./saas.css";
import "./compact.css";
import "./product-catalog.css";
import "./ads-dashboard.css";

export const metadata: Metadata = {
  title: "Emi House — Quản lý shop",
  description: "Đơn hàng, doanh thu và chi phí của Emi House trong một không gian.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi">
      <body className="antialiased">{children}</body>
    </html>
  );
}
