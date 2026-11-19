// Arrays drawn as a row of cells (task 11.4). Pure: a step goes in, strips come out.
//
// Which arrays: local arrays, arrays inside local objects (an array-based stack or
// queue), and arrays made with new[]. Arrays of objects stay in the stack panel.
// Markers: int variables the program uses to index the array (a[j], arr[top]), found
// next to it: in its frame, in its object, or in the running function when that function
// holds a pointer to it (a sorting function's parameter). Waiting recursive calls add none,
// so merge sort shows one `left`, not one per level. An array whose name or owner says
// "heap" is also drawn as the complete binary tree it stands for.
import type { MemoryItem, Step } from "@/core/types";
import type { ArrayCell, ArrayMarker, ArrayStrip, HeapView } from "./types";

export const CELL_W = 48;
export const CELL_H = 36;
const TITLE_H = 22;
const MARK_H = 18;
const MARK_GAP = 3;
const INDEX_H = 18;
const STRIP_GAP = 30;
/** Longer arrays show a window of this many cells around the markers. */
const MAX_CELLS = 16;
const HEAP_D = 36;
const HEAP_LEVEL = 54;
const HEAP_SLOT = 46;

const HEAP_NAME = /heap|priority/i;
const SIZE_NAMES = ["size", "count", "heapSize", "length", "n"];

interface Candidate { cell: MemoryItem; active: boolean; /** The name the array goes by where this variable lives. */ via: string }
interface Found { item: MemoryItem; title: string; owner: string; candidates: Candidate[]; heapHint: boolean }

const scalars = (items: MemoryItem[] | undefined) => (items ?? []).filter((c) => c.kind === "scalar");
const drawable = (a: MemoryItem) => a.kind === "array" && (a.children ?? []).every((c) => c.kind === "scalar" || c.kind === "pointer");
const named = (cells: MemoryItem[], active: boolean, via: string): Candidate[] => cells.map((cell) => ({ cell, active, via }));

function collect(step: Step): Found[] {
  const found: Found[] = [];
  const top = step.stack.length - 1;
  // Variables next to a pointer to an array (a sorting function's parameter, `int* p = arr`), by array id.
  const pointing = new Map<string, Candidate[]>();
  const point = (id: string, more: Candidate[]) => pointing.set(id, [...(pointing.get(id) ?? []), ...more]);
  const thisOf = new Map<string, number>(); // object id -> frame index of a method running on it
  step.stack.forEach((frame, fi) => {
    for (const v of frame.variables) {
      if (v.kind !== "pointer" || !v.pointsTo) continue;
      if (v.name === "this") thisOf.set(v.pointsTo, fi);
      else if (fi === top) point(v.pointsTo, named(scalars(frame.variables), true, v.name));
    }
  });

  step.stack.forEach((frame, fi) => {
    for (const v of frame.variables) {
      if (v.kind === "array" && drawable(v)) {
        found.push({ item: v, title: v.name, owner: frame.name, candidates: named(scalars(frame.variables), fi === top, v.name), heapHint: HEAP_NAME.test(v.name) });
      } else if (v.kind === "object") {
        const method = thisOf.get(v.id);
        const fields = scalars(v.children);
        const locals = method === top ? scalars(step.stack[method].variables) : [];
        const near = (via: string) => [...named(fields, fi === top || method === top, via), ...named(locals, method === top, via)];
        for (const field of v.children ?? []) {
          if (field.kind === "array" && drawable(field)) {
            found.push({
              item: field, title: `${v.name}.${field.name}`, owner: frame.name, candidates: near(field.name),
              heapHint: HEAP_NAME.test(field.name) || HEAP_NAME.test(v.typeName) || HEAP_NAME.test(v.name),
            });
          } else if (field.kind === "pointer" && field.pointsTo) {
            point(field.pointsTo, near(field.name)); // a member pointer to an array made with new[]
          }
        }
      }
    }
  });

  for (const h of step.heap) {
    if (!drawable(h)) continue;
    const owners = step.stack.flatMap((f) => f.variables).filter((v) => v.pointsTo === h.id || v.children?.some((c) => c.pointsTo === h.id));
    found.push({ item: h, title: "", owner: "heap", candidates: [], heapHint: owners.some((o) => HEAP_NAME.test(o.name) || HEAP_NAME.test(o.typeName)) });
  }
  for (const f of found) f.candidates.push(...(pointing.get(f.item.id) ?? []));
  // Arrays of pointers go last, nearest the nodes their arrows point down to.
  return found.sort((a, b) => Number(hasPointers(a.item)) - Number(hasPointers(b.item)));
}

const hasPointers = (a: MemoryItem) => (a.children ?? []).some((c) => c.kind === "pointer");

function cellText(c: MemoryItem): string {
  if (c.kind !== "pointer") return c.value ?? "";
  if (c.pointsTo) return "";
  return c.dangling ? "deleted" : c.value === "?" ? "?" : "NULL";
}

function markerWidth(label: string): number {
  return Math.round(14 + label.length * 6.6);
}

function heapView(cells: MemoryItem[], size: number, x: number, y: number, read: Set<string>): HeapView {
  const nodes: HeapView["nodes"] = [];
  const edges: HeapView["edges"] = [];
  if (size <= 0) return { nodes, edges };
  const depth = Math.floor(Math.log2(size));
  const total = 2 ** depth * HEAP_SLOT;
  const centre = (k: number) => {
    const d = Math.floor(Math.log2(k + 1));
    const p = k - (2 ** d - 1);
    return { x: x + ((p + 0.5) * total) / 2 ** d, y: y + d * HEAP_LEVEL + HEAP_D / 2 };
  };
  for (let k = 0; k < size; k++) {
    const c = centre(k);
    const cell = cells[k];
    nodes.push({ cellId: cell.id, index: k, text: cellText(cell), changed: !!cell.changed, read: read.has(cell.id), x: c.x - HEAP_D / 2, y: c.y - HEAP_D / 2, width: HEAP_D, height: HEAP_D });
    if (k > 0) {
      const p = centre(Math.floor((k - 1) / 2));
      const len = Math.hypot(c.x - p.x, c.y - p.y);
      const ux = (c.x - p.x) / len, uy = (c.y - p.y) / len;
      const r = HEAP_D / 2;
      edges.push({ from: { x: p.x + ux * r, y: p.y + uy * r }, to: { x: c.x - ux * r, y: c.y - uy * r } });
    }
  }
  return { nodes, edges };
}

/**
 * Strips for every drawable array of the step, stacked from `top` downwards. `indexes` says which
 * variables the program uses to index each array name; only those become markers.
 */
export function layoutArrays(step: Step, top: number, indexes: Map<string, Set<string>>): { strips: ArrayStrip[]; height: number } {
  const read = new Set(step.read ?? []);
  const strips: ArrayStrip[] = [];
  let y = top;
  for (const f of collect(step)) {
    const elems = f.item.children ?? [];
    const length = elems.length;
    const seen = new Set<string>();
    const markers: ArrayMarker[] = [];
    for (const { cell, active, via } of f.candidates) {
      if (seen.has(cell.id) || !indexes.get(via)?.has(cell.name)) continue;
      const index = Number(cell.value);
      if (!Number.isInteger(index) || index < -1 || index > length) continue;
      seen.add(cell.id);
      markers.push({ id: cell.id, label: cell.name, index, active, x: 0, y: 0, width: markerWidth(cell.name), height: MARK_H });
    }

    // The window of cells to draw.
    let lo = 0, hi = Math.min(length, MAX_CELLS);
    const far = Math.max(-1, ...markers.map((m) => m.index));
    if (far >= hi) { hi = Math.min(length, far + 2); lo = Math.max(0, hi - MAX_CELLS); }
    const leftPad = lo > 0 || markers.some((m) => m.index === -1) ? CELL_W : 0;
    const slots = hi - lo + (hi < length || markers.some((m) => m.index === length) ? 1 : 0);

    // Markers stack upwards above their cell.
    const perIndex = new Map<number, number>();
    for (const m of markers) perIndex.set(m.index, (perIndex.get(m.index) ?? 0) + 1);
    const markRows = Math.max(0, ...perIndex.values());
    const cellsY = y + TITLE_H + markRows * (MARK_H + MARK_GAP);
    const xOf = (index: number) => leftPad + (index - lo) * CELL_W;
    const used = new Map<number, number>();
    for (const m of markers) {
      const row = used.get(m.index) ?? 0;
      used.set(m.index, row + 1);
      m.x = xOf(m.index) + (CELL_W - m.width) / 2;
      m.y = cellsY - (row + 1) * (MARK_H + MARK_GAP);
    }
    const cells: ArrayCell[] = elems.slice(lo, hi).map((c, k) => ({
      cellId: c.id, index: lo + k, x: xOf(lo + k), y: cellsY, width: CELL_W, height: CELL_H,
      text: cellText(c), pointer: c.kind === "pointer", pointsTo: c.pointsTo, changed: !!c.changed, read: read.has(c.id),
    }));

    let height = TITLE_H + markRows * (MARK_H + MARK_GAP) + CELL_H + INDEX_H;
    let width = leftPad + slots * CELL_W;
    let heap: HeapView | undefined;
    if (f.heapHint && length > 0) {
      const sizeCell = SIZE_NAMES.map((n) => f.candidates.find((c) => c.cell.name === n)?.cell).find((c) => c && Number(c.value) >= 0 && Number(c.value) <= length);
      const filled = elems.findIndex((c) => c.value === "?");
      const size = sizeCell ? Number(sizeCell.value) : filled === -1 ? length : filled;
      heap = heapView(elems, size, leftPad, y + height + 10, read);
      if (heap.nodes.length > 0) {
        const depth = Math.floor(Math.log2(size));
        height += 10 + (depth + 1) * HEAP_LEVEL;
        width = Math.max(width, leftPad + 2 ** depth * HEAP_SLOT);
      }
    }
    strips.push({
      id: f.item.id, title: f.title, owner: f.owner, length, x: 0, y, width, height, cellsY,
      cells, skippedBefore: lo, hiddenAfter: length - hi, markers, heap,
    });
    y += height + STRIP_GAP;
  }
  return { strips, height: strips.length > 0 ? y - top - STRIP_GAP : 0 };
}
