// diffSteps: what changed between two consecutive steps.
//
// Events are derived by comparing snapshots, so an event exists only if the trace
// really shows it. Thanks to structural sharing, a cell that is the same object in both
// steps is skipped without being looked at.
import type { CellOwner, MemoryItem, StackFrame, Step, TraceEvent } from "../types";

/** "h3_next" -> "h3". Stack cells ("f0_head") have no heap root. */
export function heapRootOf(id: string | null | undefined): string | null {
  if (!id || id[0] !== "h") return null;
  const cut = id.indexOf("_");
  return cut < 0 ? id : id.slice(0, cut);
}

/** What a pointer cell refers to: a live target, the object it dangles at, or nothing. */
export function pointerTarget(item: MemoryItem): string | null {
  return item.pointsTo ?? item.freedTarget ?? null;
}

function joinName(path: string, name: string): string {
  if (!path) return name;
  return name.startsWith("[") ? `${path}${name}` : `${path}.${name}`;
}

function diffCell(prev: MemoryItem | undefined, next: MemoryItem, owner: CellOwner, path: string, out: TraceEvent[]) {
  if (prev === next) return;
  const name = joinName(path, next.name);
  if (next.children) {
    next.children.forEach((child, i) => {
      const before = prev?.children?.[i]?.id === child.id ? prev.children[i] : prev?.children?.find((c) => c.id === child.id);
      diffCell(before, child, owner, name, out);
    });
    return;
  }
  const declared = prev === undefined;
  if (next.kind === "pointer") {
    const from = prev ? pointerTarget(prev) : null;
    const to = pointerTarget(next);
    // A pointer whose target was deleted keeps its value: that is not a reassignment.
    const becameDangling = !!next.dangling && !prev?.dangling && from === to;
    if (!becameDangling && (declared || from !== to || prev?.value !== next.value)) {
      out.push({ type: "pointer_changed", cellId: next.id, owner, name, from, to, declared });
    }
    return;
  }
  if (declared || prev?.value !== next.value) {
    out.push({ type: "value_changed", cellId: next.id, owner, name, from: prev?.value ?? null, to: next.value ?? "", declared });
  }
}

function diffFrame(prev: StackFrame, next: StackFrame, out: TraceEvent[]) {
  if (prev === next) return;
  const owner: CellOwner = { kind: "frame", id: next.id, name: next.name };
  for (const v of next.variables) {
    diffCell(prev.variables.find((p) => p.id === v.id), v, owner, "", out);
  }
}

/**
 * Events that turn `prev` into `next`. Pass null for the first step.
 * Order: frames popped, frames pushed, allocations, cell changes, frees, unreachable, output.
 */
export function diffSteps(prev: Step | null, next: Step): TraceEvent[] {
  const out: TraceEvent[] = [];
  const prevStack = prev?.stack ?? [];
  const prevHeap = prev?.heap ?? [];

  if (prevStack !== next.stack) {
    const before = new Map(prevStack.map((f) => [f.callId, f]));
    const after = new Set(next.stack.map((f) => f.callId));
    for (let i = prevStack.length - 1; i >= 0; i--) {
      const f = prevStack[i];
      if (!after.has(f.callId)) out.push({ type: "frame_pop", frameId: f.id, functionName: f.name });
    }
    for (const f of next.stack) {
      const old = before.get(f.callId);
      if (!old) out.push({ type: "frame_push", frameId: f.id, functionName: f.name });
      else diffFrame(old, f, out);
    }
  }

  if (prevHeap !== next.heap) {
    const before = new Map(prevHeap.map((h) => [h.id, h]));
    const after = new Set(next.heap.map((h) => h.id));
    for (const h of next.heap) {
      const old = before.get(h.id);
      if (!old) {
        out.push({ type: "alloc", objectId: h.id, typeName: h.typeName });
      } else if (old !== h) {
        diffCell(old, h, { kind: "object", id: h.id, name: h.typeName }, "", out);
      }
    }
    for (const h of prevHeap) {
      if (!after.has(h.id)) out.push({ type: "free", objectId: h.id, typeName: h.typeName });
    }
    for (const h of next.heap) {
      if (h.orphaned && !before.get(h.id)?.orphaned) out.push({ type: "became_unreachable", objectId: h.id, typeName: h.typeName });
    }
  }

  if (next.output) out.push({ type: "output", text: next.output });
  return out;
}
