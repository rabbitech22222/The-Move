import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "THE MOVE OS — 편집 작업 공간",
    template: "%s · THE MOVE OS",
  },
  description:
    "정보 수집, 콘텐츠 제작과 소셜 미디어 운영을 위한 편집 작업 공간입니다.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
