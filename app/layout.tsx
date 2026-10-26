import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "옌쌤 과학 수강 예약",
  description: "학생 수업 예약과 취소 요청을 관리합니다.",
  manifest: "/manifest.webmanifest?v=ye-sci",
  appleWebApp: {capable:true,title:"YE SCI",statusBarStyle:"default"},
  icons: {
    icon: "/favicon.svg?v=ye-sci",
    shortcut: "/favicon.svg?v=ye-sci",
    apple: "/app-icon-192-ye-sci.png",
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
