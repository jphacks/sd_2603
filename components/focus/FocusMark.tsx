export function FocusMark({ large = false }: { large?: boolean }) {
  return <span aria-hidden className={`focus-mark ${large ? "focus-mark-large" : ""}`}><span /><span /><span /><span /></span>;
}
