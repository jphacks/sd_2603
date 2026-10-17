import type { Metadata } from "next";
import { MeetingWorkspace } from "@/components/meeting/MeetingWorkspace";

export const metadata: Metadata = {
  title: "会議 | Meeting Facilitator",
  description: "会議映像とアジェンダを共有するワークスペース",
};

export default function MeetingPage() {
  return <MeetingWorkspace />;
}
