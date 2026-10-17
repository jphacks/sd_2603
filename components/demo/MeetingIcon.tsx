import type { ReactNode } from "react";

export type MeetingIconName = "mic" | "camera" | "captions" | "present" | "hand" | "more" | "phone" | "people" | "info" | "shield";

export function MeetingIcon({ name, off = false }: { name: MeetingIconName; off?: boolean }) {
  const paths: Record<MeetingIconName, ReactNode> = {
    mic: <><rect x="9" y="2" width="6" height="13" rx="3" /><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8" /></>,
    camera: <><rect x="2" y="5" width="13" height="14" rx="3" /><path d="m15 9 7-4v14l-7-4" /></>,
    captions: <><rect x="2" y="4" width="20" height="16" rx="3" /><path d="M10 9a3 3 0 1 0 0 6M19 9a3 3 0 1 0 0 6" /></>,
    present: <><rect x="2" y="3" width="20" height="15" rx="2" /><path d="M8 22h8M12 18v4M12 14V7m-4 4 4-4 4 4" /></>,
    hand: <path d="M7 12V6a1.5 1.5 0 0 1 3 0v5-7a1.5 1.5 0 0 1 3 0v7-6a1.5 1.5 0 0 1 3 0v6-4a1.5 1.5 0 0 1 3 0v9c0 4-3 6-7 6-3 0-5-2-7-5l-2-3a1.5 1.5 0 0 1 2-2l3 3" />,
    more: <><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></>,
    phone: <path d="M3 16v-4c5-5 13-5 18 0v4l-5-1v-3a11 11 0 0 0-8 0v3l-5 1Z" />,
    people: <><circle cx="9" cy="7" r="3" /><path d="M2 21v-3a7 7 0 0 1 14 0v3M17 4a3 3 0 0 1 0 6M19 14a5 5 0 0 1 3 5v2" /></>,
    info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7v.1" /></>,
    shield: <><path d="m12 2 8 3v6c0 5-8 11-8 11S4 16 4 11V5l8-3Z" /><path d="m8 11 3 3 5-6" /></>,
  };
  return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}{off && <path d="m2 2 20 20" strokeWidth="2.3" />}</svg>;
}
