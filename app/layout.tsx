import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "THE MOVE OS — Your editorial workspace",
    template: "%s · THE MOVE OS",
  },
  description:
    "A considered workspace for discovery, editorial production, and social media operations.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
