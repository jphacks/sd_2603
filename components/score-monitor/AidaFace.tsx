// docs/brand/aida-face-*.svg と同じ形。色は currentColor。
export type AidaExpression = "watching" | "nudge" | "redirect";

const labels: Record<AidaExpression, string> = {
  watching: "見守る",
  nudge: "きっかけをつくる",
  redirect: "話を戻す",
};

export function AidaFace({ expression }: { expression: AidaExpression }) {
  return (
    <svg
      className="jm-face"
      viewBox="0 -34 384 344"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      role="img"
      aria-label={`AIDA ${labels[expression]}`}
    >
      <rect x="11" y="11" width="292" height="287" rx="63" strokeWidth="22" />
      {expression === "watching" && (
        <path d="M65.8 141H119.8M191.7 141H246.9" strokeWidth="22" />
      )}
      {expression === "nudge" && (
        <>
          <path d="M92.6 116V145.5M219.5 116V145.5" strokeWidth="24" />
          <circle cx="156.5" cy="209" r="25" strokeWidth="16" />
        </>
      )}
      {expression === "redirect" && (
        <>
          <path
            d="M68.7 108L112.5 133L68.8 158.7M244.7 108.2L199.5 133L243.7 158.7"
            strokeWidth="16.3"
          />
          <path
            d="M142.5 177.5L119 202L142.5 227.5M119 202H180A13.5 13.5 0 0 1 193.5 215.5V238.5"
            strokeWidth="17.5"
          />
        </>
      )}
      {expression !== "watching" && (
        <path
          className="jm-face-signal"
          d="M317 5.5L345.1-22.4M336.7 39.4L371.7 26"
          strokeWidth="20"
        />
      )}
    </svg>
  );
}

export const expressionLabel = (expression: AidaExpression) =>
  labels[expression];
