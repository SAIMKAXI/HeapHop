// The icon and the small drawing for each Learn topic. The drawings are plain SVG in the
// site's colours (accent strokes over the card), so they follow the light and dark themes.
import type { ReactNode } from "react";
import { ArrowDownWideNarrow, ArrowLeftRight, ArrowRightToLine, Layers, Link2, ListTree, Network, Scale, Triangle } from "lucide-react";
import type { LessonTopic } from "@content/lessons";

const ICONS: Record<LessonTopic, (size: number) => ReactNode> = {
  sorting: (s) => <ArrowDownWideNarrow size={s} aria-hidden />,
  lists: (s) => <Link2 size={s} aria-hidden />,
  doubly: (s) => <ArrowLeftRight size={s} aria-hidden />,
  stacks: (s) => <Layers size={s} aria-hidden />,
  queues: (s) => <ArrowRightToLine size={s} aria-hidden />,
  bst: (s) => <ListTree size={s} aria-hidden />,
  avl: (s) => <Scale size={s} aria-hidden />,
  heaps: (s) => <Triangle size={s} aria-hidden />,
  graphs: (s) => <Network size={s} aria-hidden />,
};
export const TopicIcon = ({ topic, size = 20 }: { topic: LessonTopic; size?: number }) => <>{ICONS[topic](size)}</>;

// Shared pieces. "soft" is a node box: card-coloured with an accent outline.
const soft = { fill: "color-mix(in srgb, var(--accent) 14%, var(--card))", stroke: "var(--accent)", strokeWidth: 1.6 };
const hot = { fill: "var(--accent)", stroke: "var(--accent)", strokeWidth: 1.6 };
const line = { stroke: "var(--accent)", strokeWidth: 1.6, fill: "none", strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
const dim = { ...line, stroke: "color-mix(in srgb, var(--accent) 45%, transparent)" };
/** A short arrow from (x1,y) to (x2,y) with an open head. */
const Arrow = ({ x1, x2, y, back = false }: { x1: number; x2: number; y: number; back?: boolean }) => {
  const [a, b] = back ? [x2, x1] : [x1, x2];
  const d = b > a ? -4 : 4;
  return <g {...line}><path d={`M${a} ${y}H${b}`} /><path d={`M${b + d} ${y - 3}L${b} ${y}L${b + d} ${y + 3}`} /></g>;
};
const Node = ({ x, y, r = 7, on = false }: { x: number; y: number; r?: number; on?: boolean }) => <circle cx={x} cy={y} r={r} {...(on ? hot : soft)} />;

const ART: Record<LessonTopic, ReactNode> = {
  sorting: (
    <>
      {[16, 26, 36, 48, 60].map((h, i) => <rect key={i} x={14 + i * 19} y={70 - h} width={13} height={h} rx={2.5} {...(i === 4 ? hot : soft)} />)}
      <path d="M12 74H110" {...dim} />
    </>
  ),
  lists: (
    <>
      {[0, 1, 2].map((i) => <rect key={i} x={6 + i * 38} y={30} width={24} height={20} rx={4} {...(i === 0 ? hot : soft)} />)}
      <Arrow x1={30} x2={44} y={40} /><Arrow x1={68} x2={82} y={40} />
      <path d="M106 40H114M114 34V46" {...dim} />
    </>
  ),
  doubly: (
    <>
      {[0, 1, 2].map((i) => <rect key={i} x={6 + i * 40} y={28} width={26} height={24} rx={4} {...(i === 1 ? hot : soft)} />)}
      <Arrow x1={32} x2={46} y={35} /><Arrow x1={72} x2={86} y={35} />
      <Arrow x1={32} x2={46} y={45} back /><Arrow x1={72} x2={86} y={45} back />
    </>
  ),
  stacks: (
    <>
      {[0, 1, 2, 3].map((i) => <rect key={i} x={38} y={62 - i * 13} width={44} height={10} rx={3} {...(i === 3 ? hot : soft)} />)}
      <g {...line}><path d="M100 8V26" /><path d="M96 22L100 26L104 22" /></g>
      <path d="M30 74H90" {...dim} />
    </>
  ),
  queues: (
    <>
      {[0, 1, 2, 3].map((i) => <rect key={i} x={24 + i * 19} y={30} width={15} height={20} rx={3} {...(i === 0 ? hot : soft)} />)}
      <Arrow x1={118} x2={102} y={40} /><Arrow x1={20} x2={4} y={40} />
    </>
  ),
  bst: (
    <>
      <g {...dim}><path d="M60 14L36 38M60 14L84 38M36 38L24 62M36 38L48 62M84 38L96 62" /></g>
      <Node x={60} y={14} on /><Node x={36} y={38} /><Node x={84} y={38} /><Node x={24} y={62} /><Node x={48} y={62} /><Node x={96} y={62} />
    </>
  ),
  avl: (
    <>
      <g {...dim}><path d="M50 18L30 44M50 18L70 44M70 44L84 68" /></g>
      <Node x={50} y={18} /><Node x={30} y={44} /><Node x={70} y={44} on /><Node x={84} y={68} />
      <g {...line}><path d="M92 18A20 20 0 0 1 108 40" /><path d="M103 38L108 40L110 35" /></g>
    </>
  ),
  heaps: (
    <>
      <g {...dim}><path d="M60 10L40 30M60 10L80 30M40 30L30 50M40 30L50 50" /></g>
      <Node x={60} y={10} r={6} on /><Node x={40} y={30} r={6} /><Node x={80} y={30} r={6} /><Node x={30} y={50} r={6} /><Node x={50} y={50} r={6} />
      {[0, 1, 2, 3, 4].map((i) => <rect key={i} x={22 + i * 16} y={62} width={14} height={12} rx={2} {...(i === 0 ? hot : soft)} />)}
    </>
  ),
  graphs: (
    <>
      <g {...dim}><path d="M20 24L56 14L96 28L84 62L40 62L20 24M56 14L40 62M56 14L84 62" /></g>
      <Node x={20} y={24} /><Node x={56} y={14} on /><Node x={96} y={28} /><Node x={84} y={62} /><Node x={40} y={62} />
    </>
  ),
};

export function TopicArt({ topic, className }: { topic: LessonTopic; className?: string }) {
  return <svg viewBox="0 0 120 80" className={className} aria-hidden data-topic-art={topic}>{ART[topic]}</svg>;
}
