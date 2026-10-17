export const cameraDemos = {
  "off-track": { label: "脱線", message: "議題に\n戻ってみませんか", background: "/focus-states/state-off-track-orange-centered-pale.png" },
  silence: { label: "沈黙", message: "気になることは\nありますか？", background: "/focus-states/state-silence-blue-centered-pale.png" },
  "on-track": { label: "順調", message: "良いペースで\n進んでいます", background: "/focus-states/state-on-track-green-centered-pale.png" },
} as const;

export type CameraDemoMode = keyof typeof cameraDemos;
