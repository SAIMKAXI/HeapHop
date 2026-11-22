// When cur is where in the login page's 3D list (heap-scene.tsx), kept apart so it can be tested.
// Each node gets HOP seconds: cur rests on it (that node glows) for the first REST of the hop,
// then moves to the next node. On the last node it rests the whole hop, then starts at head.

export const HOP = 1.3;
export const REST = 0.55;

export interface CurState {
  /** The node cur is on, or leaving. */
  from: number;
  /** The node cur is moving to. */
  to: number;
  /** 0 while resting on `from`, rising to 1 on arrival at `to` (before easing). */
  progress: number;
  /** The node that glows: the one cur rests on, or -1 while it moves. */
  glowing: number;
}

export function curAt(t: number, count: number): CurState {
  const k = (Math.max(0, t) % (count * HOP)) / HOP;
  const from = Math.min(count - 1, Math.floor(k));
  const last = from === count - 1;
  const progress = last ? 0 : Math.max(0, Math.min(1, (k - from - REST) / (1 - REST)));
  return { from, to: last ? from : from + 1, progress, glowing: progress === 0 ? from : -1 };
}
