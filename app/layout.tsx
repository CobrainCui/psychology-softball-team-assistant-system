import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Navbar from "@/components/Navbar";
import SiteFooter from "@/components/SiteFooter";
import PendingClaimGate from "@/components/auth/PendingClaimGate";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "垒球训练辅助系统",
  description: "垒球队伤病防护、每日状态测评与赛场数据记录一体化工具",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh-CN"
      className={`${geistSans.variable} ${geistMono.variable} h-full bg-white antialiased print:h-auto`}
    >
      {/* 打印防呆：取消强制全屏高度与 flex 布局，避免打印时出现空白页或内容被裁切 */}
      <body className="flex min-h-full flex-col bg-white text-zinc-900 print:block print:min-h-0">
        <Navbar />
        <div className="flex min-h-0 flex-1 flex-col bg-zinc-50">
          <PendingClaimGate>{children}</PendingClaimGate>
        </div>
        <SiteFooter />
      </body>
    </html>
  );
}
