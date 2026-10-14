import type { Metadata } from "next";
import "./globals.css";
import { SessionProvider } from "@/components/focus/SessionProvider";

export const metadata: Metadata = {
  title: "Focus | Meeting Facilitator",
  description: "会話に集中するためのAI会議ファシリテーター・デモ",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ja"
      className="h-full antialiased"
    >
      <body className="min-h-full flex flex-col"><SessionProvider>{children}</SessionProvider></body>
    </html>
  );
}
