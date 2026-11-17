// Layout per step, computed on first view and kept for the life of the trace.
// Stepping back to a step that was already shown costs a map lookup.
import { detectLists, type ListPlan, type StepStructures } from "@/core/structures";
import type { TraceModel } from "@/core/trace";
import type { MemoryItem } from "@/core/types";
import { layoutStep, type Layout, type NodeBox, type Rect } from "@/layout";

export interface ComputedStep {
  structures: StepStructures;
  layout: Layout;
  /** Heap objects of the step by id. */
  items: Map<string, MemoryItem>;
  /** Node boxes of the layout by id. */
  boxes: Map<string, NodeBox>;
}

const caches = new WeakMap<ListPlan, Map<number, ComputedStep>>();

export function computeStep(model: TraceModel, plan: ListPlan, stepIndex: number): ComputedStep {
  let cache = caches.get(plan);
  if (!cache) caches.set(plan, (cache = new Map()));
  let hit = cache.get(stepIndex);
  if (!hit) {
    const step = model.trace.steps[stepIndex];
    const structures = detectLists(step);
    const layout = layoutStep(step, stepIndex, plan, structures);
    hit = {
      structures, layout,
      items: new Map(step.heap.map((h) => [h.id, h])),
      boxes: new Map(layout.nodes.map((n) => [n.id, n])),
    };
    cache.set(stepIndex, hit);
  }
  return hit;
}

const SAMPLES = 48;
const frames = new WeakMap<ListPlan, Rect>();

/**
 * A rectangle that holds the picture for (nearly) the whole run, from a sample of its
 * steps. Fitting the view to it once means the camera does not jump while stepping.
 */
export function traceBounds(model: TraceModel, plan: ListPlan): Rect {
  const known = frames.get(plan);
  if (known) return known;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const stride = Math.max(1, Math.floor(model.length / SAMPLES));
  for (let i = 0; i < model.length; i += stride) {
    const b = computeStep(model, plan, i).layout.bounds;
    if (b.width === 0 && b.height === 0) continue;
    minX = Math.min(minX, b.x); minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.width); maxY = Math.max(maxY, b.y + b.height);
  }
  const rect = minX === Infinity ? { x: 0, y: 0, width: 0, height: 0 } : { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  frames.set(plan, rect);
  return rect;
}

/** Smallest rectangle containing both. An empty rectangle is ignored. */
export function unionRect(a: Rect, b: Rect): Rect {
  if (a.width === 0 && a.height === 0) return b;
  if (b.width === 0 && b.height === 0) return a;
  const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
  return { x, y, width: Math.max(a.x + a.width, b.x + b.width) - x, height: Math.max(a.y + a.height, b.y + b.height) - y };
}
