// AIDA's three faces, in the same coordinates as docs/brand/aida-face-*.svg.
// The frame occupies 0..314 x 0..309; the "notice" lines reach above and to the right.
// Keep these shapes in sync with the SVG files and firmware/src/main.cpp.

export type FaceKind = "watching" | "nudge" | "redirect";

export const FACE_VIEWBOX = { x: 0, y: -34, width: 384, height: 344 } as const;
export const FACE_FRAME = { width: 314, height: 309 } as const;

const FRAME = `<rect x="11" y="11" width="292" height="287" rx="63" stroke-width="22"/>`;
const NOTICE = `<path d="M317 5.5L345.1-22.4M336.7 39.4L371.7 26" stroke-width="20"/>`;

const PARTS: Record<FaceKind, string[]> = {
  watching: [
    FRAME,
    `<path d="M65.8 141H119.8M191.7 141H246.9" stroke-width="22"/>`,
  ],
  nudge: [
    FRAME,
    `<path d="M92.6 116V145.5M219.5 116V145.5" stroke-width="24"/>`,
    `<circle cx="156.5" cy="209" r="25" stroke-width="16"/>`,
    NOTICE,
  ],
  redirect: [
    FRAME,
    `<path d="M68.7 108L112.5 133L68.8 158.7M244.7 108.2L199.5 133L243.7 158.7" stroke-width="16.3"/>`,
    `<path d="M142.5 177.5L119 202L142.5 227.5M119 202H180A13.5 13.5 0 0 1 193.5 215.5V238.5" stroke-width="17.5"/>`,
    NOTICE,
  ],
};

// A <g> drawing the face with its frame's top-left corner at (x, y), scaled by `scale`.
export function faceGroup(kind: FaceKind, x: number, y: number, scale: number, color: string) {
  return `<g transform="translate(${x} ${y}) scale(${scale})" fill="none" stroke="${color}" stroke-linecap="round" stroke-linejoin="round">
    ${PARTS[kind].join("\n    ")}
  </g>`;
}
