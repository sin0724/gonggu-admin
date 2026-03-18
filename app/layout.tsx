import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "공구 캠페인 관리 시스템",
  description: "공구 캠페인 운영을 위한 관리자 시스템",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
