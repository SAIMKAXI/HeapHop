// The interpreter's memory: heap cells, stack frames, and reading / writing by address.
//
// An address is a dotted path from a root:
//   "h3"            heap allocation number 3
//   "h3.next"       the field `next` of that object
//   "h1.2.data"     field `data` of element 2 of a heap array
//   "s4.list.head"  field `head` of the local variable `list` in the call with serial 4
// Heap numbers and call serials are never reused, so a stale address can always be
// recognised (use after delete, pointer to a local of a function that returned).
import type { ClassDef, TypeRef } from "./ast";
import type { RunLimits } from "../types";
import { fault, StopSignal } from "./errors";
import { chr, type Value } from "./values";

export interface HeapCell {
  id: string;
  n: number;
  /** Type of the object, or of one element when `isArray`. */
  type: TypeRef;
  isArray: boolean;
  value: Value;
  /** Bumped on every write into this cell. The recorder re-reads a cell only when this changes. */
  version: number;
  line: number;
}

export interface Slot {
  /** Unique within the frame. Equals `name` unless an inner block shadows an outer variable. */
  key: string;
  name: string;
  type: TypeRef;
  isArray: boolean;
  value: Value;
  /** For a reference parameter: the address it is another name for. */
  ref: string | null;
}

export interface Frame {
  serial: number;
  /** "main", "LinkedList::insertAtEnd" */
  name: string;
  className: string | null;
  /** Address of the object a method runs on. */
  thisAddr: string | null;
  /** Innermost block last. */
  scopes: Slot[][];
  callerLine: number;
  version: number;
}

interface Root {
  parts: string[];
  /** Index of the first path segment after the root. */
  start: number;
  box: { value: Value };
  touch: () => void;
}

export class Memory {
  heap = new Map<string, HeapCell>();
  freed = new Map<string, { type: string; line: number }>();
  frames: Frame[] = [];
  /** Roots ("h3", "s4") that died since the recorder last looked. */
  deaths: string[] = [];
  /** Addresses of array elements read since the recorder last asked (`takeReads`). */
  private reads: string[] = [];
  private nextHeap = 1;
  private nextSerial = 0;

  constructor(
    private classes: Map<string, ClassDef>,
    private limits: RunLimits
  ) {}

  // ---- heap ----------------------------------------------------------------

  alloc(type: TypeRef, isArray: boolean, value: Value, line: number): string {
    if (this.heap.size >= this.limits.maxHeapObjects) {
      throw new StopSignal("truncated", `The program allocated more than ${this.limits.maxHeapObjects} objects, so the trace stops here.`);
    }
    const n = this.nextHeap++;
    const id = `h${n}`;
    this.heap.set(id, { id, n, type, isArray, value, version: 0, line });
    return id;
  }

  free(id: string, line: number) {
    const cell = this.heap.get(id);
    if (!cell) return;
    this.heap.delete(id);
    this.freed.set(id, { type: cell.type.base, line });
    this.deaths.push(id);
  }

  // ---- stack ---------------------------------------------------------------

  pushFrame(name: string, className: string | null, thisAddr: string | null, callerLine: number): Frame {
    const frame: Frame = { serial: this.nextSerial++, name, className, thisAddr, scopes: [[]], callerLine, version: 0 };
    this.frames.push(frame);
    return frame;
  }

  popFrame() {
    const frame = this.frames.pop();
    if (frame) this.deaths.push(`s${frame.serial}`);
  }

  top(): Frame { return this.frames[this.frames.length - 1]; }

  declare(name: string, type: TypeRef, isArray: boolean, value: Value, ref: string | null = null): Slot {
    const frame = this.top();
    let key = name;
    let n = 1;
    while (frame.scopes.some((sc) => sc.some((s) => s.key === key))) key = `${name}~${++n}`;
    const slot: Slot = { key, name, type, isArray, value, ref };
    frame.scopes[frame.scopes.length - 1].push(slot);
    frame.version++;
    return slot;
  }

  /** Innermost declaration of `name` in a frame. */
  findSlot(frame: Frame, name: string): Slot | null {
    for (let i = frame.scopes.length - 1; i >= 0; i--) {
      const sc = frame.scopes[i];
      for (let j = sc.length - 1; j >= 0; j--) if (sc[j].name === name) return sc[j];
    }
    return null;
  }

  slotAddr(frame: Frame, slot: Slot): string {
    return slot.ref ?? `s${frame.serial}.${slot.key}`;
  }

  // ---- addresses -----------------------------------------------------------

  private root(addr: string): Root {
    const parts = addr.split(".");
    const head = parts[0];
    if (head[0] === "h") {
      const cell = this.heap.get(head);
      if (!cell) {
        const dead = this.freed.get(head);
        if (dead) {
          throw fault("use_after_free",
            `This uses a ${dead.type} that was already deleted on line ${dead.line}. The pointer still holds its old address, but the memory is gone.`);
        }
        throw fault("other", "This pointer does not point at valid memory.");
      }
      return { parts, start: 1, box: cell, touch: () => { cell.version++; } };
    }
    const serial = Number(head.slice(1));
    const frame = this.frames.find((f) => f.serial === serial);
    const slot = frame?.scopes.flat().find((s) => s.key === parts[1]);
    if (!frame || !slot) {
      throw fault("use_after_free",
        "This pointer refers to a local variable that no longer exists (its function returned or its block ended).");
    }
    return { parts, start: 2, box: slot, touch: () => { frame.version++; } };
  }

  private child(cur: Value, seg: string): Value {
    if (typeof cur === "object" && cur.k === "obj") {
      if (!(seg in cur.f)) throw fault("other", `${cur.type} has no member named "${seg}".`);
      return cur.f[seg];
    }
    if (typeof cur === "object" && cur.k === "arr") {
      const i = Number(seg);
      if (!Number.isInteger(i) || i < 0 || i >= cur.e.length) {
        throw fault("out_of_bounds", `Index ${seg} is outside the array, which has ${cur.e.length} element${cur.e.length === 1 ? "" : "s"} (valid: 0 to ${cur.e.length - 1}).`);
      }
      return cur.e[i];
    }
    if (typeof cur === "object" && cur.k === "str") {
      const i = Number(seg);
      // s[s.length()] is the terminating '\0' in C++, so it is allowed.
      if (!Number.isInteger(i) || i < 0 || i > cur.s.length) {
        throw fault("out_of_bounds", `Index ${seg} is outside the string, which has ${cur.s.length} character${cur.s.length === 1 ? "" : "s"} (valid: 0 to ${cur.s.length - 1}).`);
      }
      return chr(cur.s[i] ?? "\0");
    }
    if (typeof cur === "object" && cur.k === "uninit") {
      throw fault("uninitialised_read", `This reads "${seg}" from an object that has no value yet.`);
    }
    throw fault("other", `Cannot read "${seg}" here: this is not an object or an array.`);
  }

  read(addr: string): Value {
    const r = this.root(addr);
    let cur = r.box.value;
    let parent: Value = cur;
    for (let i = r.start; i < r.parts.length; i++) { parent = cur; cur = this.child(cur, r.parts[i]); }
    if (r.parts.length > r.start && typeof parent === "object" && parent.k === "arr") this.reads.push(addr);
    return cur;
  }

  /** Array elements read since the last call, oldest first. */
  takeReads(): string[] {
    return this.reads.splice(0);
  }

  write(addr: string, v: Value) {
    const r = this.root(addr);
    if (r.parts.length === r.start) {
      r.box.value = v;
    } else {
      let cur = r.box.value;
      for (let i = r.start; i < r.parts.length - 1; i++) cur = this.child(cur, r.parts[i]);
      const last = r.parts[r.parts.length - 1];
      this.child(cur, last); // validates the member / index
      if (typeof cur === "object" && cur.k === "str") throw fault("other", "Changing one character of a string is not supported yet. Build a new string instead, for example with +.");
      if (typeof cur === "object" && cur.k === "obj") cur.f[last] = v;
      else if (typeof cur === "object" && cur.k === "arr") cur.e[Number(last)] = v;
    }
    r.touch();
  }

  /** Is the root of this address still alive? */
  alive(addr: string): boolean {
    const head = addr.split(".")[0];
    if (head[0] === "h") return this.heap.has(head);
    const serial = Number(head.slice(1));
    const frame = this.frames.find((f) => f.serial === serial);
    return !!frame && frame.scopes.flat().some((s) => s.key === addr.split(".")[1]);
  }

  /** Declared type of the cell at an address, used to convert values on assignment. */
  typeAt(addr: string): { type: TypeRef; isArray: boolean } | null {
    const parts = addr.split(".");
    let type: TypeRef;
    let isArray: boolean;
    let start: number;
    if (parts[0][0] === "h") {
      const cell = this.heap.get(parts[0]);
      if (!cell) return null;
      ({ type, isArray } = cell);
      start = 1;
    } else {
      const serial = Number(parts[0].slice(1));
      const slot = this.frames.find((f) => f.serial === serial)?.scopes.flat().find((s) => s.key === parts[1]);
      if (!slot) return null;
      ({ type, isArray } = slot);
      start = 2;
    }
    for (let i = start; i < parts.length; i++) {
      if (isArray) { isArray = false; continue; } // an index selects one element of the same type
      const field = this.classes.get(type.base)?.fields.find((f) => f.name === parts[i]);
      if (!field) return null;
      type = field.type;
      isArray = field.arraySize !== null;
    }
    return { type, isArray };
  }
}
