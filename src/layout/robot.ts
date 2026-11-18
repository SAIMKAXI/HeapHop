// What the robot does when the student steps once, forward or back: a short list of beats
// built from what the step changed (core events) and where things are drawn (layouts).
// Pure: the interface only plays the beats.
import type { TraceEvent } from "@/core/types";
import { heapRootOf } from "@/core/trace";
import type { Layout, NodeBox, Point, Rect } from "./types";

export type RobotBeat =
  /** Fly so the robot's feet are at `to`. */
  | { kind: "fly"; to: Point }
  /** Take the arrow of pointer `cellId` by its tip and move the tip from `from` to `to`; the arrow starts at `base`. */
  | { kind: "drag"; cellId: string; base: Point; from: Point; to: Point }
  /** Bring a node in from above and set it down in its box. */
  | { kind: "drop"; nodeId: string; box: Rect }
  /** Pick a node up from its box and take it away. */
  | { kind: "carry"; nodeId: string; box: Rect };

export interface RobotMove {
  beats: RobotBeat[];
  /** Rocket boots (trees) instead of hovering (lists). */
  thrust: boolean;
  /** The node the robot stands on afterwards, or null when it went home. */
  standOn: string | null;
  /** Arrows (by pointer cell) and nodes the canvas hides until the beats are done. */
  hide: string[];
}

interface MoveInput {
  /** What changed between the earlier and the later of the two steps. */
  events: TraceEvent[];
  /** 1: the later step is being shown; -1: stepping back to the earlier one. */
  direction: 1 | -1;
  /** Layout of the step being left, and of the step being shown. */
  before: Layout;
  after: Layout;
  standingOn: string | null;
  home: Point;
  /** The step being shown is the first or the last one. */
  atEnd: boolean;
}

/**
 * Where the robot's feet go when it is at a node, clear of the pointer chips: on the top
 * edge of a box (chips sit on the left), or hovering beside a tree circle (chips sit above it).
 */
export const perch = (box: NodeBox): Point =>
  box.family === -2 ? { x: box.x + box.width + 10, y: box.y + 20 } : { x: box.x + box.width - 28, y: box.y };

/** Home: just outside the top right corner of the whole run's picture. */
export const robotHome = (bounds: Rect): Point => ({ x: bounds.x + bounds.width + 24, y: bounds.y + 70 });

type Change =
  | { kind: "alloc" | "free"; id: string }
  | { kind: "field"; cellId: string; owner: string; from: string | null; to: string | null }
  | { kind: "visit"; to: string };

/** The step's changes in the direction being shown. */
function changesOf(events: TraceEvent[], direction: 1 | -1): Change[] {
  const out: Change[] = [];
  for (const e of events) {
    if (e.type === "alloc" || e.type === "free") {
      const forward = e.type === "alloc" ? "alloc" : "free";
      out.push({ kind: direction > 0 ? forward : forward === "alloc" ? "free" : "alloc", id: e.objectId });
    } else if (e.type === "pointer_changed") {
      const [from, to] = direction > 0 ? [heapRootOf(e.from), heapRootOf(e.to)] : [heapRootOf(e.to), heapRootOf(e.from)];
      if (e.owner.kind === "object" && !e.declared && from !== to) out.push({ kind: "field", cellId: e.cellId, owner: e.owner.id, from, to });
      else if (e.owner.kind === "frame" && to) out.push({ kind: "visit", to });
    }
  }
  return direction > 0 ? out : out.reverse();
}

const rectOf = ({ x, y, width, height }: Rect): Rect => ({ x, y, width, height });
const byId = (layout: Layout, id: string | null) => (id ? layout.nodes.find((n) => n.id === id) : undefined);

/** Where an arrow coming from `from` meets a box: the top of a tree node, otherwise the near side. */
function entry(box: NodeBox, from: Point): Point {
  if (box.family === -2) return { x: box.x + box.width / 2, y: box.y };
  const y = Math.min(Math.max(from.y, box.y + 10), box.y + box.height - 10);
  return from.x <= box.x + box.width / 2 ? { x: box.x, y } : { x: box.x + box.width, y };
}

/** Where pointer `cellId` of `owner` starts in this layout. */
function base(layout: Layout, cellId: string, owner: NodeBox): Point | null {
  const arrow = layout.arrows.find((a) => a.id === cellId);
  if (arrow) return arrow.start;
  const terminal = layout.terminals.find((t) => t.id === cellId);
  if (terminal) return terminal.stem.from;
  const row = owner.rows.find((r) => r.cellId === cellId);
  return row ? { x: owner.x + owner.width, y: owner.y + row.y } : null;
}

/** Where the tip of pointer `cellId` sits in this layout: on its target, on its NULL box, or at its base. */
function tip(layout: Layout, cellId: string, target: string | null, from: Point): Point {
  const arrow = layout.arrows.find((a) => a.id === cellId && a.to === target);
  if (arrow) return arrow.end;
  const box = byId(layout, target);
  if (box) return entry(box, from);
  const terminal = layout.terminals.find((t) => t.id === cellId);
  return terminal ? { x: terminal.x + terminal.width / 2, y: terminal.y + terminal.height / 2 } : from;
}

const shift = (p: Point, from: Rect, to: Rect): Point => ({ x: p.x + to.x - from.x, y: p.y + to.y - from.y });

export function planRobotMove({ events, direction, before, after, standingOn, home, atEnd }: MoveInput): RobotMove {
  const changes = changesOf(events, direction);
  const drops: RobotBeat[] = [], drags: RobotBeat[] = [], carries: RobotBeat[] = [];
  const hide: string[] = [];
  let standOn = byId(after, standingOn) ? standingOn : null;

  for (const c of changes) {
    if (c.kind === "alloc") {
      const box = byId(after, c.id);
      if (box) { drops.push({ kind: "drop", nodeId: c.id, box: rectOf(box) }); hide.push(c.id); standOn = c.id; }
    } else if (c.kind === "free") {
      const box = byId(before, c.id);
      if (box) carries.push({ kind: "carry", nodeId: c.id, box: rectOf(box) });
    } else if (c.kind === "field") {
      const owner = byId(after, c.owner), ownerBefore = byId(before, c.owner);
      const start = owner && base(after, c.cellId, owner);
      if (!owner || !start) continue;
      // The old tip: on the old target where it is still drawn, else where it was, moved along with its node.
      const oldBase = ownerBefore && base(before, c.cellId, ownerBefore);
      const from = byId(after, c.from) ? entry(byId(after, c.from)!, start)
        : ownerBefore && oldBase ? shift(tip(before, c.cellId, c.from, oldBase), ownerBefore, owner) : start;
      const to = tip(after, c.cellId, c.to, start);
      if (Math.hypot(to.x - from.x, to.y - from.y) < 4) continue;
      drags.push({ kind: "drag", cellId: c.cellId, base: start, from, to });
      hide.push(c.cellId);
      standOn = direction > 0 && byId(after, c.to) ? c.to : c.owner;
    }
  }
  // Where the program's own pointer went (cur = cur->next) decides where the robot ends up.
  const lastVisit = changes.findLast((c) => c.kind === "visit" && byId(after, c.to));
  if (lastVisit?.kind === "visit") standOn = lastVisit.to;
  if (atEnd) standOn = null;

  const perched = byId(after, standOn);
  return {
    beats: [...drops, ...drags, ...carries, { kind: "fly", to: perched ? perch(perched) : home }],
    thrust: after.nodes.some((n) => n.family === -2) || before.nodes.some((n) => n.family === -2),
    standOn: perched ? standOn : null,
    hide,
  };
}
