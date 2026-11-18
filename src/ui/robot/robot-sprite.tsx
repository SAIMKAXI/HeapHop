// The HeapHop robot, drawn from the approved artwork. Its feet are at (0, 0) and it is
// about 64 world units tall, a little under half a node's width. The player moves it and works three parts:
// data-part="flame" (rocket jets), "arm" (the right arm, rotated to reach) and "hand" (the claw).
import { memo } from "react";

const SCALE = 0.151;
/** The right hand when the arm reaches out, relative to the feet. */
export const ROBOT_HAND = { x: 25.7, y: -32 };
/** Rotation of the right arm around its shoulder when reaching. */
export const REACH = "rotate(-76 260 252)";

function RobotSpriteImpl() {
  return (
    <g transform={`scale(${SCALE}) translate(-205 -464)`}>
      <defs>
      <linearGradient id="hhbot-shell" x1="0" y1="0" x2="0.35" y2="1">
      <stop offset="0" stopColor="#fbf9f6"/>
      <stop offset="0.55" stopColor="#e4e0da"/>
      <stop offset="1" stopColor="#a9a49c"/>
      </linearGradient>
      <linearGradient id="hhbot-shellSide" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stopColor="#cfcac3"/>
      <stop offset="0.45" stopColor="#f4f1ec"/>
      <stop offset="1" stopColor="#9c978f"/>
      </linearGradient>
      <linearGradient id="hhbot-dark" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stopColor="#4a4e57"/>
      <stop offset="1" stopColor="#1b1d22"/>
      </linearGradient>
      <radialGradient id="hhbot-joint" cx="0.38" cy="0.32" r="0.75">
      <stop offset="0" stopColor="#6b707a"/>
      <stop offset="0.6" stopColor="#2c2f36"/>
      <stop offset="1" stopColor="#15171b"/>
      </radialGradient>
      <linearGradient id="hhbot-visor" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stopColor="#2a2e37"/>
      <stop offset="1" stopColor="#090a0d"/>
      </linearGradient>
      <radialGradient id="hhbot-eye" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stopColor="#ffffff"/>
      <stop offset="0.45" stopColor="#fff1d6"/>
      <stop offset="0.8" stopColor="#ffb35c"/>
      <stop offset="1" stopColor="#f07a1f" stopOpacity="0"/>
      </radialGradient>
      <radialGradient id="hhbot-orange" cx="0.35" cy="0.3" r="0.8">
      <stop offset="0" stopColor="#ffb066"/>
      <stop offset="0.5" stopColor="#ee7a24"/>
      <stop offset="1" stopColor="#a24711"/>
      </radialGradient>
      <linearGradient id="hhbot-gloss" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stopColor="#ffffff" stopOpacity="0.55"/>
      <stop offset="1" stopColor="#ffffff" stopOpacity="0"/>
      </linearGradient>
      <filter id="hhbot-glow" x="-80%" y="-80%" width="260%" height="260%">
      <feGaussianBlur stdDeviation="5" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
      <linearGradient id="hhbot-limbWhite" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stopColor="#fdfbf8"/><stop offset="0.5" stopColor="#e2ded8"/><stop offset="1" stopColor="#9f9a92"/>
      </linearGradient>
      <linearGradient id="hhbot-limbDark" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stopColor="#5d626c"/><stop offset="0.5" stopColor="#2f323a"/><stop offset="1" stopColor="#16181c"/>
      </linearGradient>
      </defs>
      <g data-part="flame" style={{ display: "none" }}>
      <path d="M124,462 Q140,540 156,462 Z" fill="#ef9f27"/><path d="M132,462 Q140,505 148,462 Z" fill="#fde7b0"/>
      <path d="M282,462 Q298,540 314,462 Z" fill="#ef9f27"/><path d="M290,462 Q298,505 306,462 Z" fill="#fde7b0"/>
      </g>
      <g>
      <rect x="123.4" y="350.0" width="87.3" height="36" rx="18.0" fill="url(#hhbot-limbWhite)" transform="rotate(110.6 167.0 368.0)"/>
      <rect x="118.3" y="398.0" width="69.4" height="34" rx="17.0" fill="url(#hhbot-limbWhite)" transform="rotate(106.4 153.0 415.0)"/>
      <circle cx="158" cy="394" r="15" fill="url(#hhbot-joint)"/>
      <path d="M104,452 q2,-26 40,-28 q34,-1 38,26 q1,9 -8,10 l-62,1 q-8,0 -8,-9 z" fill="url(#hhbot-shell)"/>
      <path d="M104,452 q1,-17 18,-24 q-4,14 -2,32 l-8,0 q-8,0 -8,-8 z" fill="url(#hhbot-orange)"/>
      <rect x="102" y="456" width="82" height="8" rx="4" fill="#1d1f24"/>
      </g>
      <g>
      <rect x="204.6" y="349.0" width="88.8" height="36" rx="18.0" fill="url(#hhbot-limbWhite)" transform="rotate(60.5 249.0 367.0)"/>
      <rect x="235.6" y="396.0" width="70.8" height="34" rx="17.0" fill="url(#hhbot-limbWhite)" transform="rotate(67.6 271.0 413.0)"/>
      <circle cx="263" cy="392" r="15" fill="url(#hhbot-joint)"/>
      <path d="M250,452 q2,-26 40,-28 q38,0 44,26 q1,9 -8,10 l-68,1 q-8,0 -8,-9 z" fill="url(#hhbot-shell)"/>
      <path d="M308,425 q24,5 26,25 q1,9 -8,10 l-12,0 q2,-20 -6,-35 z" fill="url(#hhbot-orange)"/>
      <rect x="248" y="456" width="88" height="8" rx="4" fill="#1d1f24"/>
      </g>
      <g>
      <path d="M166,322 q40,16 80,0 l-4,26 q-36,14 -72,0 z" fill="url(#hhbot-dark)"/>
      <circle cx="178" cy="342" r="16" fill="url(#hhbot-joint)"/>
      <circle cx="236" cy="342" r="16" fill="url(#hhbot-joint)"/>
      </g>
      <g>
      <rect x="193" y="214" width="26" height="22" rx="6" fill="url(#hhbot-dark)"/>
      <path d="M150,262 q0,-36 55,-36 q57,0 57,36 l-4,58 q-4,30 -53,30 q-48,0 -52,-30 z" fill="url(#hhbot-shell)"/>
      <path d="M160,268 q2,-26 45,-27 q-30,8 -33,40 l-2,30 q-8,-6 -9,-14 z" fill="url(#hhbot-gloss)"/>
      <path d="M168,318 q37,14 76,0 l-2,8 q-36,14 -72,0 z" fill="#2a2d33" opacity="0.55"/>
      <circle cx="206" cy="284" r="15" fill="url(#hhbot-joint)"/>
      <circle cx="206" cy="284" r="7" fill="url(#hhbot-orange)"/>
      <circle cx="202" cy="280" r="2.2" fill="#fff" opacity="0.8"/>
      </g>
      <g>
      <circle cx="152" cy="252" r="19" fill="url(#hhbot-joint)"/>
      <rect x="105.0" y="268.0" width="68.0" height="26" rx="13.0" fill="url(#hhbot-limbWhite)" transform="rotate(115.3 139.0 281.0)"/>
      <circle cx="128" cy="304" r="13" fill="url(#hhbot-joint)"/>
      <rect x="102.0" y="311.0" width="46.1" height="20" rx="10.0" fill="url(#hhbot-limbDark)" transform="rotate(94.4 125.0 321.0)"/>
      <g><circle cx="124" cy="340" r="11" fill="url(#hhbot-joint)"/><path d="M124,346 l-9,18" stroke="#2c2f36" strokeWidth="7" strokeLinecap="round"/><path d="M124,346 l7,19" stroke="#2c2f36" strokeWidth="7" strokeLinecap="round"/></g>
      </g>
      <g>
      <g>
      <rect x="203" y="58" width="5" height="34" rx="2.5" fill="url(#hhbot-dark)"/>
      <circle cx="205.5" cy="52" r="12" fill="url(#hhbot-orange)"/>
      <ellipse cx="201" cy="47" rx="4" ry="2.6" fill="#fff" opacity="0.7"/>
      </g>
      <g>
      <ellipse cx="124" cy="160" rx="22" ry="30" fill="#2a2d33"/>
      <ellipse cx="120" cy="160" rx="18" ry="26" fill="url(#hhbot-orange)"/>
      <ellipse cx="114" cy="150" rx="5" ry="8" fill="#fff" opacity="0.35"/>
      </g>
      <g>
      <ellipse cx="288" cy="160" rx="22" ry="30" fill="#2a2d33"/>
      <ellipse cx="292" cy="160" rx="18" ry="26" fill="url(#hhbot-orange)"/>
      <ellipse cx="288" cy="150" rx="5" ry="8" fill="#fff" opacity="0.35"/>
      </g>
      <path d="M206,86 q84,0 86,72 q2,62 -86,64 q-88,-2 -86,-64 q2,-72 86,-72 z" fill="url(#hhbot-shell)"/>
      <path d="M150,110 q30,-22 70,-20 q-48,8 -64,44 z" fill="url(#hhbot-gloss)"/>
      <path d="M126,170 q8,46 80,48 q-58,-10 -72,-50 z" fill="#8f8a83" opacity="0.35"/>
      <g id="hhbot-visor">
      <rect x="146" y="126" width="120" height="74" rx="34" fill="url(#hhbot-visor)"/>
      <path d="M160,136 q46,-10 92,0 q-4,10 -10,12 q-36,-8 -72,0 q-8,-4 -10,-12 z" fill="#ffffff" opacity="0.12"/>
      <g filter="url(#hhbot-glow)">
      <ellipse cx="183" cy="164" rx="14" ry="16" fill="url(#hhbot-eye)"/>
      <ellipse cx="230" cy="164" rx="14" ry="16" fill="url(#hhbot-eye)"/>
      <ellipse cx="183" cy="164" rx="7" ry="9" fill="#fffaf0"/>
      <ellipse cx="230" cy="164" rx="7" ry="9" fill="#fffaf0"/>
      </g>
      </g>
      </g>
      <g data-part="arm">
      <circle cx="260" cy="252" r="19" fill="url(#hhbot-joint)"/>
      <rect x="239.0" y="268.0" width="68.0" height="26" rx="13.0" fill="url(#hhbot-limbWhite)" transform="rotate(64.7 273.0 281.0)"/>
      <circle cx="284" cy="304" r="13" fill="url(#hhbot-joint)"/>
      <rect x="264.0" y="311.0" width="46.1" height="20" rx="10.0" fill="url(#hhbot-limbDark)" transform="rotate(85.6 287.0 321.0)"/>
      <g data-part="hand"><circle cx="288" cy="340" r="11" fill="url(#hhbot-joint)"/><path d="M288,346 l9,18" stroke="#2c2f36" strokeWidth="7" strokeLinecap="round"/><path d="M288,346 l-7,19" stroke="#2c2f36" strokeWidth="7" strokeLinecap="round"/></g>
      </g>
    </g>
  );
}

export const RobotSprite = memo(RobotSpriteImpl);
