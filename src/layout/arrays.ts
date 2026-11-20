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
import type { ArrayCell, ArrayMarker, ArrayStrip, GraphView, HeapView, Point } from "./types";

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
/** An array (2-D, or of list pointers) with a name like this is also drawn as a graph. */
const GRAPH_NAME = /adj|graph|neighbou?r|edge|cost|weight/i;
const VISITED_NAME = /^(visited|seen|done|marked|inMST|inTree|finali[sz]ed|included)$/i;
const LABEL_NAME = /^(dist|distance|key|indegree|inDegree|component|comp)$/i;
const MATRIX_W = 34;
const MATRIX_H = 28;
const ROW_LABEL_W = 22;
const MAX_GRID = 12;
const VERTEX_D = 34;
const SIZE_NAMES = ["size", "count", "heapSize", "length", "n"];
/** An array used as a stack stands upright, as lectures draw it: index 0 at the bottom. */
export const STACK_NAME = /stack/i;
const STACK_INDEX = /^(top|topIndex|numItems|sp)$/i;
/** Queue tags that lectures write under the cells (front stays above). */
const BELOW = /^(rear|back|tail)$/i;
const UPRIGHT_W = 96;

interface Candidate { cell: MemoryItem; active: boolean; /** The name the array goes by where this variable lives. */ via: string }
interface Found { item: MemoryItem; title: string; owner: string; candidates: Candidate[]; heapHint: boolean; graphHint: boolean; stackHint: boolean }

const scalars = (items: MemoryItem[] | undefined) => (items ?? []).filter((c) => c.kind === "scalar");
const isRow = (a: MemoryItem) => a.kind === "array" && (a.children ?? []).every((c) => c.kind === "scalar" || c.kind === "pointer");
const isMatrix = (a: MemoryItem) => a.kind === "array" && (a.children ?? []).length > 0 && a.children!.every((r) => isRow(r) && r.children!.length > 0);
const drawable = (a: MemoryItem) => isRow(a) || isMatrix(a);
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
        found.push({ item: v, title: v.name, owner: frame.name, candidates: named(scalars(frame.variables), fi === top, v.name), heapHint: HEAP_NAME.test(v.name), graphHint: GRAPH_NAME.test(v.name), stackHint: STACK_NAME.test(v.name) });
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
              graphHint: GRAPH_NAME.test(field.name) || GRAPH_NAME.test(v.typeName),
              stackHint: STACK_NAME.test(field.name) || STACK_NAME.test(v.typeName),
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
    found.push({
      item: h, title: "", owner: "heap", candidates: [],
      heapHint: owners.some((o) => HEAP_NAME.test(o.name) || HEAP_NAME.test(o.typeName)),
      graphHint: owners.some((o) => GRAPH_NAME.test(o.name) || GRAPH_NAME.test(o.typeName)),
      stackHint: owners.some((o) => STACK_NAME.test(o.name) || STACK_NAME.test(o.typeName)),
    });
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

/** Markers for one axis: ints the program uses in that subscript position of the array. */
function markersFor(f: Found, key: (via: string) => string, length: number, indexes: Map<string, Set<string>>, axis?: "row" | "col"): ArrayMarker[] {
  const seen = new Set<string>();
  const out: ArrayMarker[] = [];
  for (const { cell, active, via } of f.candidates) {
    if (seen.has(cell.id) || !indexes.get(key(via))?.has(cell.name)) continue;
    const index = Number(cell.value);
    if (!Number.isInteger(index) || index < -1 || index > length) continue;
    seen.add(cell.id);
    // A reference parameter (int& back) and the variable it refers to carry one name and one value: one tag.
    const twin = out.find((m) => m.label === cell.name && m.index === index);
    if (twin) { twin.active ||= active; continue; }
    out.push({ id: cell.id, label: cell.name, index, active, axis, x: 0, y: 0, width: markerWidth(cell.name), height: MARK_H });
  }
  return out;
}

/** An array stack: a column of cells inside an open-topped container, tags to the right of their cell. */
function uprightStrip(f: Found, y: number, markers: ArrayMarker[], read: Set<string>): ArrayStrip {
  const elems = f.item.children ?? [];
  const length = elems.length;
  const cellW = Math.max(UPRIGHT_W, Math.round(16 + 8.5 * Math.max(0, ...elems.map((c) => cellText(c).length))));
  // Show the used part plus a little headroom; a long array hides the rest above.
  const far = Math.max(0, ...markers.map((m) => m.index));
  const used = elems.findLastIndex((c) => c.value !== "?") + 1;
  const shown = Math.min(length, Math.max(4, far + 2, used + 1), MAX_CELLS);
  const left = ROW_LABEL_W;
  // Room above the column for its open-top walls, and for "+N more cells above".
  const cellsY = y + TITLE_H + (shown < length ? 28 : 14);
  const bottom = cellsY + shown * CELL_H;
  const rowY = (index: number) => bottom - (index + 1) * CELL_H;
  const cells: ArrayCell[] = elems.slice(0, shown).map((c, k) => ({
    cellId: c.id, index: k, x: left, y: rowY(k), width: cellW, height: CELL_H,
    text: cellText(c), pointer: c.kind === "pointer", pointsTo: c.pointsTo, changed: !!c.changed, read: read.has(c.id),
  }));
  const offset = new Map<number, number>();
  for (const m of markers) {
    const dx = offset.get(m.index) ?? 0;
    offset.set(m.index, dx + m.width + MARK_GAP);
    m.x = left + cellW + 10 + dx;
    m.y = rowY(m.index) + (CELL_H - MARK_H) / 2;
  }
  const tags = Math.max(0, ...offset.values());
  return {
    id: f.item.id, title: f.title, owner: f.owner, length, x: 0, y, width: left + cellW + 10 + tags, height: bottom - y + (markers.some((m) => m.index < 0) ? CELL_H : 8),
    cellsY, cells, skippedBefore: 0, hiddenAfter: length - shown, markers, upright: true,
  };
}

function rowStrip(f: Found, y: number, indexes: Map<string, Set<string>>, read: Set<string>): ArrayStrip {
  const elems = f.item.children ?? [];
  const length = elems.length;
  const markers = markersFor(f, (via) => via, length, indexes);
  if (f.stackHint || markers.some((m) => STACK_INDEX.test(m.label))) return uprightStrip(f, y, markers, read);
  // Cells widen for long values (1000000 as "infinity", strings).
  const cellW = Math.max(CELL_W, Math.round(12 + 8.5 * Math.max(0, ...elems.map((c) => cellText(c).length))));

  // The window of cells to draw.
  let lo = 0, hi = Math.min(length, MAX_CELLS);
  const far = Math.max(-1, ...markers.map((m) => m.index));
  if (far >= hi) { hi = Math.min(length, far + 2); lo = Math.max(0, hi - MAX_CELLS); }
  const leftPad = lo > 0 || markers.some((m) => m.index === -1) ? cellW : 0;
  const slots = hi - lo + (hi < length || markers.some((m) => m.index === length) ? 1 : 0);

  // Markers stack upwards above their cell; rear / back / tail hang below it, as lectures draw queues.
  const rowsAt = (below: boolean) => {
    const per = new Map<number, number>();
    for (const m of markers) if (BELOW.test(m.label) === below) per.set(m.index, (per.get(m.index) ?? 0) + 1);
    return Math.max(0, ...per.values());
  };
  const markRows = rowsAt(false);
  const belowRows = rowsAt(true);
  const cellsY = y + TITLE_H + markRows * (MARK_H + MARK_GAP);
  const xOf = (index: number) => leftPad + (index - lo) * cellW;
  const used = new Map<string, number>();
  for (const m of markers) {
    const below = BELOW.test(m.label);
    const key = `${below}:${m.index}`;
    const row = used.get(key) ?? 0;
    used.set(key, row + 1);
    m.x = xOf(m.index) + (cellW - m.width) / 2;
    m.y = below ? cellsY + CELL_H + INDEX_H + row * (MARK_H + MARK_GAP) : cellsY - (row + 1) * (MARK_H + MARK_GAP);
  }
  const cells: ArrayCell[] = elems.slice(lo, hi).map((c, k) => ({
    cellId: c.id, index: lo + k, x: xOf(lo + k), y: cellsY, width: cellW, height: CELL_H,
    text: cellText(c), pointer: c.kind === "pointer", pointsTo: c.pointsTo, changed: !!c.changed, read: read.has(c.id),
  }));

  let height = TITLE_H + (markRows + belowRows) * (MARK_H + MARK_GAP) + CELL_H + INDEX_H;
  let width = leftPad + slots * cellW;
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
  return { id: f.item.id, title: f.title, owner: f.owner, length, x: 0, y, width, height, cellsY, cells, skippedBefore: lo, hiddenAfter: length - hi, markers, heap };
}

function matrixStrip(f: Found, y: number, indexes: Map<string, Set<string>>, read: Set<string>): ArrayStrip {
  const grid = f.item.children!;
  const rows = Math.min(grid.length, MAX_GRID);
  const cols = Math.min(grid[0].children!.length, MAX_GRID);
  const cellW = Math.max(MATRIX_W, Math.round(10 + 7.5 * Math.max(0, ...grid.flatMap((r) => r.children!.map((c) => cellText(c).length)))));
  const rowMarks = markersFor(f, (via) => via, rows - 1, indexes, "row").filter((m) => m.index >= 0 && m.index < rows);
  const colMarks = markersFor(f, (via) => `${via}[]`, cols - 1, indexes, "col").filter((m) => m.index >= 0 && m.index < cols);

  // Row tags sit side by side left of the row labels; column tags stack above the column labels.
  const rowWidth = new Map<number, number>();
  for (const m of rowMarks) rowWidth.set(m.index, (rowWidth.get(m.index) ?? 0) + m.width + MARK_GAP);
  const left = Math.max(0, ...rowWidth.values());
  const perCol = new Map<number, number>();
  for (const m of colMarks) perCol.set(m.index, (perCol.get(m.index) ?? 0) + 1);
  const colRows = Math.max(0, ...perCol.values());
  const x0 = left + ROW_LABEL_W;
  const cellsY = y + TITLE_H + colRows * (MARK_H + MARK_GAP) + INDEX_H;

  const usedRow = new Map<number, number>();
  for (const m of rowMarks) {
    const offset = usedRow.get(m.index) ?? 0;
    usedRow.set(m.index, offset + m.width + MARK_GAP);
    m.x = left - offset - m.width - MARK_GAP;
    m.y = cellsY + m.index * MATRIX_H + (MATRIX_H - MARK_H) / 2;
  }
  const usedCol = new Map<number, number>();
  for (const m of colMarks) {
    const row = usedCol.get(m.index) ?? 0;
    usedCol.set(m.index, row + 1);
    m.x = x0 + m.index * cellW + (cellW - m.width) / 2;
    m.y = cellsY - INDEX_H - (row + 1) * (MARK_H + MARK_GAP);
  }
  const cells: ArrayCell[] = [];
  for (let r = 0; r < rows; r++) {
    grid[r].children!.slice(0, cols).forEach((c, k) => cells.push({
      cellId: c.id, index: r * cols + k, row: r, col: k, x: x0 + k * cellW, y: cellsY + r * MATRIX_H, width: cellW, height: MATRIX_H,
      text: cellText(c), pointer: c.kind === "pointer", pointsTo: c.pointsTo, changed: !!c.changed, read: read.has(c.id),
    }));
  }
  return {
    id: f.item.id, title: f.title, owner: f.owner, length: grid.length, x: 0, y,
    width: x0 + cols * cellW, height: cellsY - y + rows * MATRIX_H + 6, cellsY, cells,
    skippedBefore: 0, hiddenAfter: grid.length - rows, markers: [...rowMarks, ...colMarks],
    matrix: { rows, cols, x: x0, cellW, cellH: MATRIX_H },
  };
}

/** Edges of a graph: from a square matrix (non-zero cell = edge) or an array of adjacency lists. */
function graphEdges(f: Found, step: Step): { n: number; edges: { u: number; v: number; w: string }[] } | null {
  const elems = f.item.children ?? [];
  if (isMatrix(f.item)) {
    const n = elems.length;
    if (elems.some((r) => r.children!.length !== n)) return null;
    const edges: { u: number; v: number; w: string }[] = [];
    elems.forEach((r, u) => r.children!.forEach((c, v) => { if (c.value !== "0" && c.value !== "?" && c.value !== "false" && c.value !== undefined) edges.push({ u, v, w: c.value }); }));
    return { n, edges };
  }
  if (!elems.some((c) => c.kind === "pointer")) return null;
  const heap = new Map(step.heap.map((h) => [h.id, h]));
  const edges: { u: number; v: number; w: string }[] = [];
  elems.forEach((c, u) => {
    const seen = new Set<string>();
    for (let id = c.pointsTo?.split("_")[0]; id && !seen.has(id); ) {
      seen.add(id);
      const node = heap.get(id);
      const ints = (node?.children ?? []).filter((x) => x.kind === "scalar");
      const v = Number(ints[0]?.value);
      if (!node || !Number.isInteger(v)) break;
      edges.push({ u, v, w: ints.find((x) => /^(w|wt|weight|cost)$/i.test(x.name))?.value ?? "1" });
      id = node.children!.find((x) => x.kind === "pointer")?.pointsTo?.split("_")[0];
    }
  });
  return { n: elems.length, edges };
}

function graphView(f: Found, step: Step, strip: ArrayStrip, all: Found[]): GraphView | undefined {
  const g = graphEdges(f, step);
  if (!g || g.n === 0 || g.n > MAX_GRID) return undefined;
  const { n } = g;
  const directed = g.edges.some((e) => !g.edges.some((o) => o.u === e.v && o.v === e.u && o.w === e.w));
  const weighted = g.edges.some((e) => e.w !== "1" && e.w !== "true");
  const radius = Math.max(56, n * 15);
  const cx = strip.width + 60 + radius, cy = strip.cellsY + radius + 4;
  const centre = (i: number): Point => {
    const a = -Math.PI / 2 + (2 * Math.PI * i) / n;
    return { x: Math.round(cx + radius * Math.cos(a)), y: Math.round(cy + radius * Math.sin(a)) };
  };
  // The program's own per-vertex arrays colour and label the vertices.
  const perVertex = (name: RegExp) => all.find((o) => isRow(o.item) && name.test(o.item.name) && o.item.children!.length === n)?.item.children;
  const visited = perVertex(VISITED_NAME);
  const labels = perVertex(LABEL_NAME);
  const current = new Set(strip.markers.filter((m) => m.active && m.axis !== "col").map((m) => m.index));
  const looking = new Set(strip.markers.filter((m) => m.active && m.axis === "col").map((m) => m.index));
  const vertices: GraphView["vertices"] = Array.from({ length: n }, (_, i) => {
    const c = centre(i);
    const v = visited?.[i]?.value;
    const l = labels?.[i]?.value;
    return {
      index: i, x: c.x - VERTEX_D / 2, y: c.y - VERTEX_D / 2, width: VERTEX_D, height: VERTEX_D,
      visited: v !== undefined && v !== "0" && v !== "false" && v !== "?", current: current.has(i),
      label: l === undefined || l === "?" ? undefined : Number(l) >= 1e6 ? "∞" : l,
    };
  });
  const edges: GraphView["edges"] = [];
  for (const e of g.edges) {
    if (!directed && e.u > e.v) continue; // one line per pair
    if (e.u === e.v || e.v < 0 || e.v >= n) continue;
    const a = centre(e.u), b = centre(e.v);
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const ux = (b.x - a.x) / len, uy = (b.y - a.y) / len;
    const r = VERTEX_D / 2;
    const from = { x: Math.round(a.x + ux * r), y: Math.round(a.y + uy * r) };
    const to = { x: Math.round(b.x - ux * (r + (directed ? 2 : 0))), y: Math.round(b.y - uy * (r + (directed ? 2 : 0))) };
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    edges.push({
      from, to, directed, weight: weighted ? e.w : undefined, labelAt: weighted ? { x: Math.round(mid.x - uy * 11), y: Math.round(mid.y + ux * 11) } : undefined,
      active: (current.has(e.u) && looking.has(e.v)) || (!directed && current.has(e.v) && looking.has(e.u)),
    });
  }
  return { vertices, edges };
}

/**
 * Strips for every drawable array of the step, stacked from `top` downwards. `indexes` says which
 * variables the program uses to index each array name; only those become markers.
 */
export function layoutArrays(step: Step, top: number, indexes: Map<string, Set<string>>): { strips: ArrayStrip[]; height: number } {
  const read = new Set(step.read ?? []);
  const found = collect(step);
  const strips: ArrayStrip[] = [];
  let y = top;
  for (const f of found) {
    const strip = isMatrix(f.item) ? matrixStrip(f, y, indexes, read) : rowStrip(f, y, indexes, read);
    if (f.graphHint) {
      strip.graph = graphView(f, step, strip, found);
      if (strip.graph) {
        const right = Math.max(...strip.graph.vertices.map((v) => v.x + v.width));
        const bottom = Math.max(...strip.graph.vertices.map((v) => v.y + v.height + 16));
        strip.width = Math.max(strip.width, right);
        strip.height = Math.max(strip.height, bottom - y);
      }
    }
    strips.push(strip);
    y += strip.height + STRIP_GAP;
  }
  return { strips, height: strips.length > 0 ? y - top - STRIP_GAP : 0 };
}
