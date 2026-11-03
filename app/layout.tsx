import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "YE SCI 학생 공간",
  description: "닉네임으로 수업을 예약하고 내 예약을 확인하는 학생 전용 공간입니다.",
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
