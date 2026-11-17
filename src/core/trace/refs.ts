// Reverse references: for an object, every pointer that refers to it at one step.
import type { CellOwner, IncomingRef, MemoryItem, Step } from "../types";
import { heapRootOf } from "./diff";

function collect(item: MemoryItem, owner: CellOwner, path: string, into: Map<string, IncomingRef[]>) {
  const name = !path ? item.name : item.name.startsWith("[") ? `${path}${item.name}` : `${path}.${item.name}`;
  if (item.children) {
    for (const c of item.children) collect(c, owner, name, into);
    return;
  }
  const root = heapRootOf(item.pointsTo);
  if (!root) return;
  const list = into.get(root);
  const ref: IncomingRef = { cellId: item.id, owner, name };
  if (list) list.push(ref);
  else into.set(root, [ref]);
}

/** objectId -> pointers that refer to it (stack variables first, then heap fields). */
export function buildIncomingRefs(step: Step): Map<string, IncomingRef[]> {
  const into = new Map<string, IncomingRef[]>();
  for (const frame of step.stack) {
    const owner: CellOwner = { kind: "frame", id: frame.id, name: frame.name };
    for (const v of frame.variables) collect(v, owner, "", into);
  }
  for (const obj of step.heap) {
    const owner: CellOwner = { kind: "object", id: obj.id, name: obj.typeName };
    collect(obj, owner, "", into);
  }
  return into;
}
