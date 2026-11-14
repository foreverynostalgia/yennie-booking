import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "YENNIE SENSE",
  description: "닉네임으로 수업을 예약하고 내 예약을 확인하는 학생 전용 공간입니다.",
  manifest: "/student.webmanifest?v=yennie-1",
  appleWebApp: {capable:true,title:"YENNIE SENSE",statusBarStyle:"default"},
  icons: {
    icon: "/yennie-icon.png?v=1",
    shortcut: "/yennie-icon.png?v=1",
    apple: "/yennie-icon.png?v=1",
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
