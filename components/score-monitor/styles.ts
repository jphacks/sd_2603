// AIDA のデザインシステム（DESIGN.md）に合わせる。白黒 + 細い線 + 大きな角丸。
// スコアの色だけはデータの色として SCORE_META のものを使う。
export const monitorCss = `
.jev-monitor{--aida-ink:#000;--aida-paper:#fff;--aida-line:#e5e5e5;--aida-surface:#f2f2f2;font:400 13px/1.6 var(--font-noto-sans-jp),"Hiragino Sans","Yu Gothic",sans-serif;color:var(--aida-ink);background:var(--aida-paper);border:1px solid var(--aida-line);border-radius:24px;padding:28px;box-sizing:border-box;width:100%;max-width:560px}
.jev-monitor *{box-sizing:border-box}
.jm-header,.jm-footer,.jm-score-heading{display:flex;align-items:center;justify-content:space-between;gap:8px}
.jm-eyebrow{font-size:10px;font-weight:500;letter-spacing:.15em;text-transform:uppercase;color:var(--aida-ink)}
.jm-status{display:inline-flex;align-items:center;gap:6px;margin-top:4px;font-size:12px;font-weight:700}
.jm-status::before{content:"";width:8px;height:8px;border-radius:50%;border:2px solid var(--aida-ink);background:var(--aida-paper)}
.jm-status[data-live="true"]::before{background:var(--aida-ink)}
.jm-score-heading{margin:28px 0 12px;font-size:12px;font-weight:700}
.jm-score-heading span+span{font-weight:400;color:#666}
.jev-monitor code{font:500 10px ui-monospace,monospace;color:#666}
.jm-note{font-size:11px;color:#666;margin:12px 0 0}
.jm-meters{display:flex;justify-content:space-evenly;gap:12px;padding:8px 0}
.jm-channel{display:flex;flex-direction:column;align-items:center;gap:6px;min-width:0;text-align:center;font-size:12px;font-weight:700}
.jm-channel strong{font-size:20px;font-weight:900;font-variant-numeric:tabular-nums}
.jm-bar{position:relative;height:190px;width:58px;border:2px solid var(--aida-ink);border-radius:16px;background:var(--aida-paper);overflow:hidden}
.jm-fill{position:absolute;bottom:0;left:0;right:0}
.jm-threshold{position:absolute;left:0;right:0;border-top:1.5px dashed var(--aida-ink);text-align:right;font-size:9px;font-weight:500;color:var(--aida-ink);padding-right:6px}
.jm-decision{margin-top:28px;padding-top:24px;border-top:1px solid var(--aida-line)}
.jm-decision-row{display:flex;align-items:center;gap:16px;margin-top:12px}
.jm-face{flex:none;width:64px;height:auto;color:var(--aida-ink)}
.jm-decision-row strong{display:block;font-size:24px;font-weight:900;line-height:1.3}
.jm-decision-row span{font-size:12px;color:#666}
.jm-decision p{font-size:13px;margin:16px 0}
.jm-footer{font-size:11px;color:#666;padding-top:12px;border-top:1px solid var(--aida-line)}
.jm-face-signal{animation:jm-signal .2s ease-out}
@keyframes jm-signal{from{opacity:0}to{opacity:1}}
@media(prefers-reduced-motion:reduce){.jm-face-signal{animation:none}}
@media(max-width:400px){.jev-monitor{padding:18px;border-radius:20px}.jm-channel code{font-size:8px}.jm-decision-row strong{font-size:20px}.jm-face{width:52px}.jm-channel strong{font-size:16px}.jm-meters{gap:4px}.jm-bar{width:48px}}
`;
