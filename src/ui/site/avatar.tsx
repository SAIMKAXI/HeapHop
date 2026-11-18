// A small illustrated portrait for the About page: a boy (short hair) or a girl (long hair),
// with the person's own background and shirt colours.
interface AvatarProps {
  kind: "boy" | "girl";
  background: string;
  shirt: string;
}

const SKIN = "#c68a63";
const SKIN_SHADE = "#b07552";
const HAIR = "#2b1d16";

export function Avatar({ kind, background, shirt }: AvatarProps) {
  return (
    <svg viewBox="0 0 64 64" width={56} height={56} aria-hidden className="shrink-0">
      <clipPath id={`avatar-clip-${kind}-${shirt.slice(1)}`}><circle cx={32} cy={32} r={32} /></clipPath>
      <g clipPath={`url(#avatar-clip-${kind}-${shirt.slice(1)})`}>
        <rect width={64} height={64} fill={background} />
        {kind === "girl" && <path d="M17 31 Q16 12 32 12 Q48 12 47 31 L48 50 Q40 54 32 54 Q24 54 16 50 Z" fill={HAIR} />}
        <path d="M10 64 Q11 47 32 46 Q53 47 54 64 Z" fill={shirt} />
        <rect x={27.5} y={37} width={9} height={10} rx={4} fill={SKIN_SHADE} />
        <circle cx={32} cy={29} r={12} fill={SKIN} />
        {kind === "boy"
          ? <path d="M19.5 28 Q19 13.5 32 13.5 Q45 13.5 44.5 28 Q42 20.5 33 20 Q24 20.5 19.5 28 Z" fill={HAIR} />
          : <path d="M20 27 Q21 15.5 32 15.5 Q43 15.5 44 27 Q39 20.5 32 21.5 Q25 20.5 20 27 Z" fill={HAIR} />}
        <circle cx={27.5} cy={30} r={1.5} fill={HAIR} />
        <circle cx={36.5} cy={30} r={1.5} fill={HAIR} />
        <path d="M28.5 34.5 Q32 37 35.5 34.5" stroke={HAIR} strokeWidth={1.4} strokeLinecap="round" fill="none" />
      </g>
    </svg>
  );
}
