// Binary tree recognition.
//
// A tree node type has two pointers to its own type that are NOT mirror images of each
// other (that would be a doubly linked list). An extra pointer called parent / up is
// allowed and ignored for the shape.
import type { MemoryItem, Step } from "../types";
import { heapRootOf } from "../trace/diff";

export interface TreeShape {
  typeName: string;
  left: string;
  right: string;
}

export interface DetectedTree {
  typeName: string;
  shape: TreeShape;
  /** Heap id of the root. */
  root: string;
  /** Every node, parents before children, left before right. */
  nodes: string[];
  /** Child ids per node; null where the pointer is null, uninitialised or leaves the tree. */
  children: Map<string, { left: string | null; right: string | null }>;
}

const PARENT_NAME = /^(parent|par|up|p)$/i;
const LEFT_NAME = /^(left|lchild|leftchild|left_child|l|lft)$/i;
const RIGHT_NAME = /^(right|rchild|rightchild|right_child|r|rgt)$/i;

/** The two child fields of a type, or null when it does not look like a binary tree node. */
export function treeShapeOf(sample: MemoryItem): TreeShape | null {
  const fields = (sample.children ?? [])
    .filter((c) => c.kind === "pointer" && c.typeName === `${sample.typeName}*` && !PARENT_NAME.test(c.name))
    .map((c) => c.name);
  if (fields.length !== 2) return null;
  const [a, b] = fields;
  const swapped = LEFT_NAME.test(b) || RIGHT_NAME.test(a);
  return { typeName: sample.typeName, left: swapped ? b : a, right: swapped ? a : b };
}

/** Trees among the objects of one type. Every object ends up in exactly one tree. */
export function detectTrees(step: Step, typeName: string, objects: MemoryItem[], shape: TreeShape): DetectedTree[] {
  const ids = new Set(objects.map((o) => o.id));
  const childOf = (obj: MemoryItem, field: string): string | null => {
    const to = heapRootOf(obj.children?.find((c) => c.name === field)?.pointsTo);
    return to && ids.has(to) && to !== obj.id ? to : null;
  };
  const kids = new Map(objects.map((o) => [o.id, { left: childOf(o, shape.left), right: childOf(o, shape.right) }]));
  const indegree = new Map<string, number>(objects.map((o) => [o.id, 0]));
  for (const k of kids.values()) for (const c of [k.left, k.right]) if (c) indegree.set(c, (indegree.get(c) ?? 0) + 1);

  const visited = new Set<string>();
  const trees: DetectedTree[] = [];
  const grow = (root: string) => {
    const nodes: string[] = [];
    const children: DetectedTree["children"] = new Map();
    const walk = (id: string) => {
      visited.add(id);
      nodes.push(id);
      const k = kids.get(id)!;
      // A child that was already placed (shared or part of a cycle) is not drawn twice.
      const left = k.left && !visited.has(k.left) ? k.left : null;
      if (left) walk(left);
      const right = k.right && !visited.has(k.right) ? k.right : null;
      if (right) walk(right);
      children.set(id, { left, right });
    };
    walk(root);
    trees.push({ typeName, shape, root, nodes, children });
  };
  for (const o of objects) if (indegree.get(o.id) === 0) grow(o.id);
  for (const o of objects) if (!visited.has(o.id)) grow(o.id); // only reachable through a cycle
  // The tree a stack variable points at comes first; then bigger trees.
  const rooted = new Set(step.stack.flatMap((f) => f.variables).flatMap(function leaves(v: MemoryItem): string[] {
    return v.children ? v.children.flatMap(leaves) : [heapRootOf(v.pointsTo) ?? ""];
  }));
  return trees.sort((a, b) => Number(rooted.has(b.root)) - Number(rooted.has(a.root)) || b.nodes.length - a.nodes.length);
}
