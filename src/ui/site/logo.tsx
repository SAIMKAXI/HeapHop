// The HeapHop logo, drawn inline so its colours follow the site's theme (the --logo-*
// tokens in globals.css). Decorative: it always sits next to the name.
import { useId } from "react";
import { LOGO_GLINT, LOGO_NODES, LOGO_SHAPE, LOGO_VIEW_BOX } from "./logo-shape";

const stop = (offset: number, token: string) => <stop offset={offset} style={{ stopColor: `var(--logo-${token})` }} />;

export function Logo({ size = 28 }: { size?: number }) {
  // Header and footer both draw the logo, so the ids inside each copy must differ.
  const id = useId().replace(/\W/g, "");
  const [bars, crossbar, rightBar, cut] = ["bars", "crossbar", "right", "cut"].map((part) => `${id}${part}`);
  return (
    <svg viewBox={LOGO_VIEW_BOX} width={size} height={size} aria-hidden className="shrink-0">
      <defs>
        <linearGradient id={bars} x1="0" y1="0" x2="1" y2="1">{stop(0, "hi")}{stop(0.55, "mid")}{stop(1, "deep")}</linearGradient>
        <linearGradient id={crossbar}>{stop(0, "deep")}{stop(0.5, "mid")}{stop(1, "deep")}</linearGradient>
        <linearGradient id={rightBar} x1="0" y1="0.6" x2="1" y2="0.2">{stop(0, "deep")}{stop(0.5, "mid")}{stop(1, "hi")}</linearGradient>
        <mask id={cut}>
          <rect width="100" height="100" fill="#fff" />
          <path d={LOGO_SHAPE.sweep} />
          <path d={LOGO_SHAPE.chevron} />
        </mask>
      </defs>
      <g mask={`url(#${cut})`}>
        <path d={LOGO_SHAPE.leftBar} fill={`url(#${bars})`} />
        <path d={LOGO_SHAPE.crossbar} fill={`url(#${crossbar})`} />
        <path d={LOGO_SHAPE.rightBar} fill={`url(#${rightBar})`} />
      </g>
      <g style={{ stroke: "var(--logo-line)" }}>
        <path d={LOGO_SHAPE.links} fill="none" strokeWidth={1.3} strokeLinecap="round" strokeLinejoin="round" />
        {LOGO_NODES.map(({ tone, ...circle }) => (
          <circle key={`${circle.cx}`} {...circle} strokeWidth={1.1} style={{ fill: `var(--logo-${tone})` }} />
        ))}
      </g>
      <circle {...LOGO_GLINT} style={{ fill: "var(--logo-glint)" }} />
    </svg>
  );
}
