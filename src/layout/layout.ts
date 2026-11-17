// The layout engine: one step in, coordinates out. Pure math.
//
// List nodes sit in one horizontal row per list family, ordered by the trace-wide plan,
// so a node keeps its place from step to step. A node that has not been linked in yet, or
// that nothing can reach any more, sits in a lane just below its slot. Everything that is not
// a list node flows into a grid underneath.
import type { MemoryItem, Step } from "@/core/types";
import type { ListPlan, StepStructures } from "@/core/structures";
import { heapRootOf } from "@/core/trace";
import type { Arrow, ArrowKind, Chip, FieldRow, Layout, NodeBox, Rect, Terminal } from "./types";

export const NODE_W = 148;
export const HEADER_H = 28;
export const ROW_H = 24;
const NODE_PAD = 6;
export const GAP_X = 76;
const CHIP_H = 20;
const CHIP_GAP = 4;
const MAX_CHIPS = 4;
const CHIP_ZONE = MAX_CHIPS * (CHIP_H + CHIP_GAP) + 12;
const FLOAT_GAP = 44;
const ROW_GAP = 40;
const TERM_W = 44;
const TERM_H = 20;
const MAX_ROWS = 10;
/** Trees: horizontal gap between neighbours in left-to-right order, vertical gap between levels. */
const TREE_GAP_X = 20;
const TREE_LEVEL_GAP = 64;
const GRID_COLUMNS = 4;
const PITCH = NODE_W + GAP_X;

function leafRows(item: MemoryItem): { cell: MemoryItem; label: string }[] {
  const out: { cell: MemoryItem; label: string }[] = [];
  const walk = (it: MemoryItem, path: string) => {
    const label = !path ? it.name : it.name.startsWith("[") ? `${path}${it.name}` : `${path}.${it.name}`;
    if (it.children) for (const c of it.children) walk(c, label);
    else out.push({ cell: it, label });
  };
  if (item.children) for (const c of item.children) walk(c, "");
  else out.push({ cell: item, label: "value" });
  return out;
}

function boxFor(item: MemoryItem): Omit<NodeBox, "x" | "y" | "level" | "family"> & { cells: Map<string, MemoryItem> } {
  const leaves = leafRows(item);
  const shown = leaves.slice(0, MAX_ROWS);
  const rows: FieldRow[] = shown.map((l, i) => ({ cellId: l.cell.id, label: l.label, y: HEADER_H + i * ROW_H + ROW_H / 2 }));
  const hiddenRows = leaves.length - shown.length;
  const height = HEADER_H + (shown.length + (hiddenRows > 0 ? 1 : 0)) * ROW_H + NODE_PAD;
  return { id: item.id, width: NODE_W, height, rows, hiddenRows, cells: new Map(leaves.map((l) => [l.cell.id, l.cell])) };
}

const r1 = (n: number) => Math.round(n * 10) / 10;

/** Path from a pointer's field line on `src` to the box `dst`. */
function route(src: NodeBox, rowY: number, dst: NodeBox, kind: ArrowKind): Pick<Arrow, "path" | "start" | "end"> {
  const sy = src.y + rowY;
  if (src.id === dst.id) {
    // A node pointing at itself: a small loop over its top right corner.
    const start = { x: src.x + src.width, y: sy };
    const end = { x: src.x + src.width - 24, y: src.y };
    return { start, end, path: `M${start.x} ${start.y} C${start.x + 44} ${sy} ${start.x + 30} ${src.y - 40} ${end.x} ${end.y}` };
  }
  if (src.y === dst.y) {
    const gap = Math.round((dst.x - src.x) / PITCH);
    if (gap === 1) {
      const start = { x: src.x + src.width, y: sy }, end = { x: dst.x, y: sy };
      return { start, end, path: `M${start.x} ${start.y} L${end.x} ${end.y}` };
    }
    if (gap === -1) {
      const start = { x: src.x, y: sy }, end = { x: dst.x + dst.width, y: sy };
      return { start, end, path: `M${start.x} ${start.y} L${end.x} ${end.y}` };
    }
    // Further apart: arc over the row (next) or under it (prev).
    const lift = Math.min(30 + 9 * Math.abs(gap), 78);
    const dir = gap > 0 ? 1 : -1;
    if (kind === "prev") {
      const start = { x: src.x + src.width / 2 - dir * 14, y: src.y + src.height };
      const end = { x: dst.x + dst.width / 2 + dir * 14, y: dst.y + dst.height };
      return { start, end, path: `M${start.x} ${start.y} C${start.x} ${start.y + lift} ${end.x} ${end.y + lift} ${end.x} ${end.y}` };
    }
    const start = { x: src.x + src.width / 2 + dir * 14, y: src.y };
    const end = { x: dst.x + dst.width / 2 - dir * 14, y: dst.y };
    return { start, end, path: `M${start.x} ${start.y} C${start.x} ${start.y - lift} ${end.x} ${end.y - lift} ${end.x} ${end.y}` };
  }
  // Different heights: leave sideways from the field line, arrive at the top or bottom edge.
  const toRight = dst.x + dst.width / 2 >= src.x + src.width / 2;
  const start = { x: toRight ? src.x + src.width : src.x, y: sy };
  const below = dst.y > src.y;
  const end = { x: dst.x + dst.width / 2, y: below ? dst.y : dst.y + dst.height };
  const pull = 46;
  const path = `M${start.x} ${start.y} C${start.x + (toRight ? pull : -pull)} ${start.y} ${end.x} ${end.y + (below ? -pull : pull)} ${end.x} ${end.y}`;
  return { start, end, path };
}

function chipWidth(label: string): number {
  return Math.round(16 + label.length * 6.6);
}

/** "h12" -> 12: heap ids are numbered in allocation order. */
const allocNumber = (id: string) => Number(id.slice(1));

/**
 * Lay out one step. `stepIndex` is the step's position in the trace.
 * The same arguments always produce the same Layout.
 */
export function layoutStep(step: Step, stepIndex: number, plan: ListPlan, structures: StepStructures): Layout {
  const items = new Map(step.heap.map((h) => [h.id, h]));
  const sized = new Map(step.heap.map((h) => [h.id, boxFor(h)]));

  // ---- list families: one row band each -----------------------------------
  const families: MemoryItem[][] = Array.from({ length: plan.familyCount }, () => []);
  const loose: MemoryItem[] = [];
  for (const h of step.heap) {
    const f = plan.family.get(h.id);
    const isListNode = f !== undefined && structures.shapes.has(h.typeName);
    if (isListNode) families[f].push(h);
    else loose.push(h);
  }

  const nodes: NodeBox[] = [];
  const boxes = new Map<string, NodeBox>();
  let top = 0;

  families.forEach((members, family) => {
    if (members.length === 0) return;
    members.sort((a, b) => (plan.rank.get(a.id) ?? 0) - (plan.rank.get(b.id) ?? 0));
    const nodeH = Math.max(...members.map((m) => sized.get(m.id)!.height));

    members.forEach((m, slot) => {
      // A newer node that has not been linked to anything yet waits below the row.
      const waiting = stepIndex < (plan.firstLinked.get(m.id) ?? Infinity)
        && members.some((o) => allocNumber(o.id) < allocNumber(m.id));
      const level: 0 | 1 = m.orphaned || waiting ? 1 : 0;
      const s = sized.get(m.id)!;
      const box: NodeBox = {
        id: m.id, x: slot * PITCH, y: top + CHIP_ZONE + (level ? nodeH + FLOAT_GAP : 0),
        width: s.width, height: s.height, rows: s.rows, hiddenRows: s.hiddenRows, level, family,
      };
      nodes.push(box);
      boxes.set(m.id, box);
    });
    top += CHIP_ZONE + nodeH + nodeH + FLOAT_GAP + ROW_GAP;
  });

  // ---- binary trees: parents above children, left to right in in-order ------
  const inTree = new Set<string>();
  const treeLinks = new Set<string>(); // "nodeId.field" of child pointers
  let treeX = 0, treeBandH = 0;
  for (const tree of structures.trees) {
    const nodeH = Math.max(...tree.nodes.map((id) => sized.get(id)!.height));
    let column = 0, depthMax = 0;
    const place = (id: string, depth: number) => {
      const kids = tree.children.get(id)!;
      if (kids.left) place(kids.left, depth + 1);
      const s = sized.get(id)!;
      const box: NodeBox = {
        id, x: treeX + column * (NODE_W + TREE_GAP_X), y: top + CHIP_ZONE + depth * (nodeH + TREE_LEVEL_GAP),
        width: s.width, height: s.height, rows: s.rows, hiddenRows: s.hiddenRows, level: items.get(id)!.orphaned ? 1 : 0, family: -2,
      };
      nodes.push(box);
      boxes.set(id, box);
      inTree.add(id);
      treeLinks.add(`${id}.${tree.shape.left}`);
      treeLinks.add(`${id}.${tree.shape.right}`);
      column++;
      depthMax = Math.max(depthMax, depth);
      if (kids.right) place(kids.right, depth + 1);
    };
    place(tree.root, 0);
    treeX += column * (NODE_W + TREE_GAP_X) + GAP_X; // the next tree of the forest goes to the right
    treeBandH = Math.max(treeBandH, CHIP_ZONE + (depthMax + 1) * (nodeH + TREE_LEVEL_GAP));
  }
  top += treeBandH > 0 ? treeBandH + ROW_GAP : 0;
  const looseRest = loose.filter((h) => !inTree.has(h.id));

  // ---- everything else: a simple grid --------------------------------------
  let col = 0, rowTop = top + (looseRest.length > 0 ? CHIP_ZONE : 0), rowH = 0;
  for (const h of looseRest) {
    const s = sized.get(h.id)!;
    const box: NodeBox = { id: h.id, x: col * PITCH, y: rowTop, width: s.width, height: s.height, rows: s.rows, hiddenRows: s.hiddenRows, level: 0, family: -1 };
    nodes.push(box);
    boxes.set(h.id, box);
    rowH = Math.max(rowH, s.height);
    if (++col === GRID_COLUMNS) { col = 0; rowTop += rowH + CHIP_ZONE + ROW_GAP; rowH = 0; }
  }

  // ---- arrows and terminals -------------------------------------------------
  const arrows: Arrow[] = [];
  const terminals: Terminal[] = [];
  const pendingTerminals: { box: NodeBox; row: FieldRow; cell: MemoryItem; kind: ArrowKind }[] = [];
  for (const box of nodes) {
    const item = items.get(box.id)!;
    const cells = sized.get(box.id)!.cells;
    const shape = box.family >= 0 ? structures.shapes.get(item.typeName) : undefined;
    for (const row of box.rows) {
      const cell = cells.get(row.cellId)!;
      if (cell.kind !== "pointer") continue;
      const kind: ArrowKind = shape && row.label === shape.next ? "next" : shape && row.label === shape.prev ? "prev"
        : treeLinks.has(`${box.id}.${row.label}`) ? "next" : "other";
      const target = boxes.get(heapRootOf(cell.pointsTo) ?? "");
      if (target) {
        arrows.push({ id: cell.id, from: box.id, to: target.id, kind, ...route(box, row.y, target, kind) });
        continue;
      }
      if (kind === "other" || cell.pointsTo || box.family < 0) continue; // only list links get an explicit end marker
      pendingTerminals.push({ box, row, cell, kind });
    }
  }
  // End markers go in the gap beside the node, on whichever side no straight arrow uses.
  const laneTaken = (x0: number, x1: number, y: number) =>
    arrows.some((a) => a.start.y === a.end.y && Math.abs(a.start.y - y) < TERM_H &&
      Math.min(a.start.x, a.end.x) < x1 && Math.max(a.start.x, a.end.x) > x0);
  for (const { box, row, cell, kind } of pendingTerminals) {
    const label: Terminal["label"] = cell.dangling ? "deleted" : cell.value === "?" ? "?" : "NULL";
    const width = label === "deleted" ? 56 : TERM_W;
    const y = box.y + row.y;
    const span = (left: boolean) => (left ? [box.x - 16 - width, box.x] : [box.x + box.width, box.x + box.width + 16 + width]);
    let left = kind === "prev";
    if (laneTaken(span(left)[0], span(left)[1], y) && !laneTaken(span(!left)[0], span(!left)[1], y)) left = !left;
    const x = left ? box.x - 16 - width : box.x + box.width + 16;
    terminals.push({
      id: cell.id, nodeId: box.id, label, x, y: y - TERM_H / 2, width, height: TERM_H,
      stem: { from: { x: left ? box.x : box.x + box.width, y }, to: { x: left ? x + width : x, y } },
    });
  }

  // ---- chips: stack pointers shown on the node they point at ----------------
  const chips: Chip[] = [];
  const perNode = new Map<string, Chip[]>();
  const topFrame = step.stack[step.stack.length - 1];
  for (let fi = step.stack.length - 1; fi >= 0; fi--) {
    const frame = step.stack[fi];
    for (const variable of frame.variables) {
      for (const leaf of variable.children ? leafRows(variable) : [{ cell: variable, label: variable.name }]) {
        const label = variable.children ? `${variable.name}.${leaf.label}` : leaf.label;
        const box = boxes.get(heapRootOf(leaf.cell.pointsTo) ?? "");
        if (leaf.cell.kind !== "pointer" || !box) continue;
        const list = perNode.get(box.id) ?? [];
        perNode.set(box.id, list);
        list.push({ id: leaf.cell.id, label, nodeId: box.id, frameId: frame.id, active: frame === topFrame, x: 0, y: 0, width: chipWidth(label), height: CHIP_H });
      }
    }
  }
  for (const [nodeId, list] of perNode) {
    const box = boxes.get(nodeId)!;
    let shown = list;
    if (list.length > MAX_CHIPS) {
      const hidden = list.length - (MAX_CHIPS - 1);
      const label = `+${hidden} more`;
      shown = [...list.slice(0, MAX_CHIPS - 1), { id: `more:${nodeId}`, label, nodeId, frameId: "", active: false, x: 0, y: 0, width: chipWidth(label), height: CHIP_H }];
    }
    shown.forEach((chip, i) => {
      chip.x = box.x + 4;
      chip.y = box.y - (i + 1) * (CHIP_H + CHIP_GAP) - 4;
      chips.push(chip);
    });
  }

  // ---- bounds ---------------------------------------------------------------
  let minX = 0, minY = 0, maxX = 0, maxY = 0;
  const grow = (r: Rect, pad = 0) => {
    minX = Math.min(minX, r.x - pad); minY = Math.min(minY, r.y - pad);
    maxX = Math.max(maxX, r.x + r.width + pad); maxY = Math.max(maxY, r.y + r.height + pad);
  };
  if (nodes.length > 0) { minX = Infinity; minY = Infinity; maxX = -Infinity; maxY = -Infinity; }
  nodes.forEach((n) => grow(n));
  chips.forEach((c) => grow(c));
  terminals.forEach((t) => grow(t));
  for (const a of arrows) {
    // Arcs bulge beyond their end points; allow for the tallest one.
    grow({ x: Math.min(a.start.x, a.end.x), y: Math.min(a.start.y, a.end.y), width: Math.abs(a.end.x - a.start.x), height: Math.abs(a.end.y - a.start.y) }, a.path.includes("C") ? 60 : 0);
  }
  const bounds = { x: r1(minX), y: r1(minY), width: r1(maxX - minX), height: r1(maxY - minY) };
  return { nodes, arrows, terminals, chips, bounds };
}
