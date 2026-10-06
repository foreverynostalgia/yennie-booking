import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "옌쌤 과학 수강 예약",
  description: "학생 수업 예약과 취소 요청을 관리합니다.",
  other: {
    "codex-preview": "development",
  },
  manifest: "/manifest.webmanifest",
  appleWebApp: {capable:true,title:"옌쌤 예약 관리자",statusBarStyle:"default"},
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
    apple: "/app-icon-192.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className="antialiased">{children}</body>
    </html>
  );
}
