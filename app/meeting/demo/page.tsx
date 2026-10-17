import type { Metadata } from "next";
import { MeetingDemo } from "@/components/demo/MeetingDemo";

export const metadata: Metadata = {
  title: "Focus 会議デモ",
  description: "会議中のFocus進行サポートを体験できるデモ画面",
};

export default function MeetingDemoPage() {
  return <MeetingDemo />;
}
