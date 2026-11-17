// Linked-list recognition.
//
// A "node type" is a struct or class with pointers to its own type. One such pointer
// makes a singly linked node; two that mirror each other (a.next == b  <=>  b.prev == a)
// make a doubly linked node. Two self-pointers that do not mirror each other (a tree's
// left / right) are left alone as "unknown".
//
// Nothing here knows about drawing. The layout engine consumes the result.
import type { MemoryItem, Step, Trace } from "../types";
import { heapRootOf } from "../trace/diff";
import { detectTrees, treeShapeOf, type DetectedTree } from "./trees";

type ListKind = "singly" | "doubly" | "circular singly" | "circular doubly";

/** Which fields of a node type link it to its neighbours. */
interface NodeShape {
  typeName: string;
  next: string;
  prev: string | null;
}

interface DetectedList {
  typeName: string;
  kind: ListKind;
  /** Heap ids from the first node, following `next`. */
  nodes: string[];
  circular: boolean;
  shape: NodeShape;
}

export interface StepStructures {
  /** Node types recognised at this step, by type name. */
  shapes: Map<string, NodeShape>;
  lists: DetectedList[];
  /** Binary trees (two self-pointers that are not mirror images). */
  trees: DetectedTree[];
  /** Types with self-pointers that fit neither a list nor a binary tree. */
  unknownTypes: string[];
}

export interface DetectOptions {
  /** "Treat this as the list head": id of a pointer cell whose target should come first. */
  headCellId?: string;
}

const NEXT_NAME = /^(next|nxt|forward|fwd|link|nextnode|next_node|nextptr)$/i;
const PREV_NAME = /^(prev|previous|prv|back|backward|prevnode|prev_node|prevptr)$/i;

function selfPointers(obj: MemoryItem): MemoryItem[] {
  return (obj.children ?? []).filter((c) => c.kind === "pointer" && c.typeName === `${obj.typeName}*`);
}

function fieldOf(obj: MemoryItem, name: string): MemoryItem | undefined {
  return obj.children?.find((c) => c.name === name);
}

/** Decide how the objects of one type are linked. Null when they do not form lists. */
function shapeOf(typeName: string, objects: MemoryItem[], byId: Map<string, MemoryItem>): NodeShape | null {
  const fields = selfPointers(objects[0]).map((f) => f.name);
  if (fields.length === 1) return { typeName, next: fields[0], prev: null };
  if (fields.length !== 2) return null;

  const [a, b] = fields;
  const named = PREV_NAME.test(a) || NEXT_NAME.test(b) ? { next: b, prev: a }
    : PREV_NAME.test(b) || NEXT_NAME.test(a) ? { next: a, prev: b }
    : null;
  const candidate = named ?? { next: a, prev: b };

  // Count links that are mirrored by a back-link, contradicted by one, or not answered yet.
  let mirrored = 0, contradicted = 0, pending = 0;
  for (const obj of objects) {
    const to = heapRootOf(fieldOf(obj, candidate.next)?.pointsTo);
    const target = to ? byId.get(to) : undefined;
    if (!target || target.typeName !== typeName || target === obj) continue;
    const back = fieldOf(target, candidate.prev);
    const backTo = heapRootOf(back?.pointsTo);
    if (backTo === obj.id) mirrored++;
    else if (backTo) contradicted++;
    else pending++;
  }
  // Fields called next/prev are trusted while a list is being rewired; unnamed pairs must prove it.
  const isDoubly = named ? contradicted <= mirrored + pending : mirrored >= 1 && contradicted === 0;
  return isDoubly ? { typeName, ...candidate } : null;
}

export function detectLists(step: Step, options: DetectOptions = {}): StepStructures {
  const byId = new Map(step.heap.map((h) => [h.id, h]));
  const byType = new Map<string, MemoryItem[]>();
  for (const obj of step.heap) {
    if (obj.kind !== "object" || selfPointers(obj).length === 0) continue;
    const list = byType.get(obj.typeName);
    if (list) list.push(obj);
    else byType.set(obj.typeName, [obj]);
  }

  // Where does the manual head override point?
  let preferred: string | null = null;
  if (options.headCellId) {
    const find = (items: MemoryItem[]): MemoryItem | undefined => {
      for (const it of items) {
        if (it.id === options.headCellId) return it;
        const inner = it.children && find(it.children);
        if (inner) return inner;
      }
      return undefined;
    };
    const cell = find(step.stack.flatMap((f) => f.variables)) ?? find(step.heap);
    preferred = heapRootOf(cell?.pointsTo);
  }

  const shapes = new Map<string, NodeShape>();
  const lists: DetectedList[] = [];
  const trees: DetectedTree[] = [];
  const unknownTypes: string[] = [];

  for (const [typeName, objects] of byType) {
    const shape = shapeOf(typeName, objects, byId);
    if (!shape) {
      const tree = treeShapeOf(objects[0]);
      if (tree) trees.push(...detectTrees(step, typeName, objects, tree));
      else unknownTypes.push(typeName);
      continue;
    }
    shapes.set(typeName, shape);

    const nextOf = new Map<string, string>();
    const indegree = new Map<string, number>(objects.map((o) => [o.id, 0]));
    for (const obj of objects) {
      const to = heapRootOf(fieldOf(obj, shape.next)?.pointsTo);
      if (to && byId.get(to)?.typeName === typeName) {
        nextOf.set(obj.id, to);
        indegree.set(to, (indegree.get(to) ?? 0) + 1);
      }
    }

    const visited = new Set<string>();
    const walk = (start: string) => {
      const nodes: string[] = [];
      let cur: string | undefined = start;
      while (cur && !visited.has(cur)) {
        visited.add(cur);
        nodes.push(cur);
        cur = nextOf.get(cur);
      }
      const circular = cur !== undefined && nodes.includes(cur); // the walk came back into itself
      const kind = `${circular ? "circular " : ""}${shape.prev ? "doubly" : "singly"}` as ListKind;
      lists.push({ typeName, kind, nodes, circular, shape });
    };

    // Chains start at nodes nothing links to. What is left afterwards is pure cycles.
    const starts = objects.filter((o) => indegree.get(o.id) === 0).map((o) => o.id);
    if (preferred && starts.includes(preferred)) { starts.splice(starts.indexOf(preferred), 1); starts.unshift(preferred); }
    for (const s of starts) walk(s);
    if (preferred && !visited.has(preferred) && indegree.has(preferred)) walk(preferred);
    for (const obj of objects) if (!visited.has(obj.id)) walk(obj.id);
  }
  return { shapes, lists, trees, unknownTypes };
}

// ---------------------------------------------------------------------------
// A stable left-to-right order for the whole run
// ---------------------------------------------------------------------------

/**
 * Where each list node sits for the entire trace, so that the picture does not jump
 * between steps: reversing a list flips its arrows, the boxes stay where they are.
 */
export interface ListPlan {
  /** Left-to-right position. Only the order matters; gaps are closed by the layout. */
  rank: Map<string, number>;
  /** Nodes that were ever linked to each other share a family, and a family shares a row. */
  family: Map<string, number>;
  familyCount: number;
  /** Index of the first step at which the node was linked to another one. Absent if it never was. */
  firstLinked: Map<string, number>;
}

/**
 * Read the whole trace once and give every list node a rank.
 * A node is placed next to the neighbour it is first linked to and never moves again.
 */
export function planLists(trace: Trace, options: DetectOptions = {}): ListPlan {
  const order: string[] = [];
  const placed = new Set<string>();
  const parent = new Map<string, string>();
  const seen: string[] = []; // every list node in order of first appearance

  const find = (x: string): string => {
    let r = x;
    while (parent.get(r) !== r) r = parent.get(r)!;
    parent.set(x, r);
    return r;
  };
  const union = (a: string, b: string) => { parent.set(find(b), find(a)); };
  const place = (id: string, index: number) => { order.splice(index, 0, id); placed.add(id); };

  const firstLinked = new Map<string, number>();
  let prevHeap: unknown = null;
  for (let stepIndex = 0; stepIndex < trace.steps.length; stepIndex++) {
    const step = trace.steps[stepIndex];
    if (step.heap === prevHeap) continue; // shared with the previous step: nothing new
    prevHeap = step.heap;
    for (const list of detectLists(step, options).lists) {
      for (const id of list.nodes) {
        if (!parent.has(id)) { parent.set(id, id); seen.push(id); }
      }
      for (let i = 0; i + 1 < list.nodes.length; i++) {
        const a = list.nodes[i], b = list.nodes[i + 1];
        union(a, b);
        if (!firstLinked.has(a)) firstLinked.set(a, stepIndex);
        if (!firstLinked.has(b)) firstLinked.set(b, stepIndex);
        if (!placed.has(a) && !placed.has(b)) { place(a, order.length); place(b, order.length); }
        else if (placed.has(a) && !placed.has(b)) place(b, order.indexOf(a) + 1);
        else if (!placed.has(a) && placed.has(b)) place(a, order.indexOf(b));
      }
    }
  }
  for (const id of seen) if (!placed.has(id)) place(id, order.length); // never linked to anything

  const rank = new Map(order.map((id, i) => [id, i]));
  const family = new Map<string, number>();
  const familyIndex = new Map<string, number>();
  for (const id of seen) {
    const root = find(id);
    if (!familyIndex.has(root)) familyIndex.set(root, familyIndex.size);
    family.set(id, familyIndex.get(root)!);
  }
  return { rank, family, familyCount: familyIndex.size, firstLinked };
}
