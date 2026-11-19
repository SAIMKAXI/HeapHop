// Recorder: turns the interpreter's live memory into the steps of the Trace contract.
//
// Structural sharing: a step reuses the MemoryItem objects of every heap
// object and stack frame that did not change since the previous step. The work per step
// depends on what changed, not on how big the heap is, and the interface can skip
// re-rendering anything whose object is the same as before.
import type { MemoryItem, RunLimits, RuntimeErrorInfo, StackFrame, Step, StepKind } from "../types";
import { typeText, type ClassDef, type TypeRef } from "./ast";
import { StopSignal } from "./errors";
import type { Frame, HeapCell, Memory } from "./memory";
import type { Ptr, Value } from "./values";

export interface StepMeta {
  kind: StepKind;
  line: number;
  label: string;
  condition?: boolean;
  output?: string;
  input?: string;
  error?: RuntimeErrorInfo;
}

interface HeapEntry {
  version: number;
  /** The object as it looks with no per-step flags. */
  clean: MemoryItem;
  /** Same content with `orphaned: true`, built on demand. */
  orphan: MemoryItem | null;
  /** Roots ("h3", "s2") this object points into. */
  refs: Set<string>;
}

interface FrameEntry {
  version: number;
  /** Versions of the variables this frame's reference parameters stand for. */
  alias: string;
  clean: StackFrame;
  refs: Set<string>;
}

export function formatDouble(v: number): string {
  if (!Number.isFinite(v)) return v > 0 ? "inf" : v < 0 ? "-inf" : "nan";
  return String(parseFloat(v.toPrecision(6)));
}

function showChar(c: string): string {
  const esc: Record<string, string> = { "\n": "\\n", "\t": "\\t", "\0": "\\0", "'": "\\'", "\\": "\\\\" };
  return `'${esc[c] ?? c}'`;
}

function sameLeaf(a: MemoryItem, b: MemoryItem): boolean {
  return a.value === b.value && a.pointsTo === b.pointsTo && a.dangling === b.dangling;
}

function markAll(item: MemoryItem): MemoryItem {
  return { ...item, changed: true, children: item.children?.map(markAll) };
}

/** Returns `next` itself when nothing differs from `prev`, otherwise a copy with `changed` flags. */
function markChanges(next: MemoryItem, prev: MemoryItem | undefined): MemoryItem {
  if (!prev) return markAll(next);
  if (next.children) {
    let any = false;
    const kids = next.children.map((c, i) => {
      const p = prev.children?.[i]?.id === c.id ? prev.children[i] : prev.children?.find((x) => x.id === c.id);
      const m = markChanges(c, p);
      if (m !== c) any = true;
      return m;
    });
    return any ? { ...next, children: kids } : next;
  }
  return sameLeaf(next, prev) ? next : { ...next, changed: true };
}

/** "[3]" for an array of 3, "[3][4]" for a 2-D array. */
function dims(v: Value): string {
  if (typeof v !== "object" || v.k !== "arr") return "";
  const first = v.e[0];
  return `[${v.e.length}]${typeof first === "object" && first.k === "arr" ? `[${first.e.length}]` : ""}`;
}

function sameArray<T>(a: T[], b: T[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

export class Recorder {
  steps: Step[] = [];
  output = "";
  /** Text printed since the last step. It is attached to the next step, so output appears in real order. */
  private pending = "";
  private heapCache = new Map<string, HeapEntry>();
  private frameCache = new Map<number, FrameEntry>();
  private prevHeap: MemoryItem[] = [];
  private prevStack: StackFrame[] = [];
  /** serial -> position from the bottom of the stack, for the step being captured. */
  private depth = new Map<number, number>();

  constructor(
    private mem: Memory,
    private classes: Map<string, ClassDef>,
    private limits: RunLimits
  ) {}

  /** Record one step. `force` is used for the final step, which must not be dropped by the cap. */
  capture(meta: StepMeta, force = false) {
    if (!force && this.steps.length >= this.limits.maxSteps) {
      throw new StopSignal("truncated",
        `The trace stops here because it reached the limit of ${this.limits.maxSteps} steps. Try a smaller input or fewer repetitions.`);
    }
    const printed = this.pending + (meta.output ?? "");
    this.pending = "";
    if (printed) {
      this.output += printed;
      if (this.output.length > this.limits.maxOutputChars) {
        throw new StopSignal("truncated", `The program printed more than ${this.limits.maxOutputChars} characters, so the trace stops here.`);
      }
    }

    this.invalidateAfterDeaths();
    this.depth.clear();
    this.mem.frames.forEach((f, i) => this.depth.set(f.serial, i));
    const read = [...new Set(this.mem.takeReads().filter((a) => this.mem.alive(a)).map((a) => this.addrToId(a)))];

    // Stack
    const reachable = new Set<string>();
    const stack: StackFrame[] = this.mem.frames.map((frame, i) => {
      let entry = this.frameCache.get(frame.serial);
      let shown: StackFrame;
      const alias = this.aliasStamp(frame);
      if (!entry || entry.version !== frame.version || entry.alias !== alias) {
        const refs = new Set<string>();
        const clean = this.buildFrame(frame, i, refs);
        shown = clean;
        if (entry) {
          const old = entry.clean;
          let any = false;
          const vars = clean.variables.map((v) => {
            const m = markChanges(v, old.variables.find((o) => o.id === v.id));
            if (m !== v) any = true;
            return m;
          });
          if (any) shown = { ...clean, variables: vars };
        }
        entry = { version: frame.version, alias, clean, refs };
        this.frameCache.set(frame.serial, entry);
      } else {
        shown = entry.clean;
      }
      for (const r of entry.refs) reachable.add(r);
      return shown;
    });

    // Heap
    const flagged = new Map<string, MemoryItem>();
    for (const cell of this.mem.heap.values()) {
      const old = this.heapCache.get(cell.id);
      if (!old || old.version !== cell.version) {
        const refs = new Set<string>();
        const clean = this.buildHeap(cell, refs);
        const marked = markChanges(clean, old?.clean);
        if (marked !== clean) flagged.set(cell.id, marked);
        this.heapCache.set(cell.id, { version: cell.version, clean, orphan: null, refs });
      }
    }

    // Reachability: everything a stack variable can get to, directly or through other objects.
    const queue = [...reachable];
    while (queue.length > 0) {
      const key = queue.pop()!;
      const refs = this.heapCache.get(key)?.refs;
      if (!refs) continue;
      for (const r of refs) if (!reachable.has(r)) { reachable.add(r); queue.push(r); }
    }

    const heap: MemoryItem[] = [];
    for (const cell of this.mem.heap.values()) {
      const entry = this.heapCache.get(cell.id)!;
      const orphaned = !reachable.has(cell.id);
      let item = flagged.get(cell.id);
      if (item) {
        if (orphaned) item = { ...item, orphaned: true };
      } else if (orphaned) {
        item = entry.orphan ??= { ...entry.clean, orphaned: true };
      } else {
        item = entry.clean;
      }
      heap.push(item);
    }

    const frame = this.mem.frames[this.mem.frames.length - 1];
    const step: Step = {
      kind: meta.kind,
      sourceLine: meta.line,
      activeFunction: frame?.name ?? "",
      explanation: meta.label,
      stack: sameArray(stack, this.prevStack) ? this.prevStack : stack,
      heap: sameArray(heap, this.prevHeap) ? this.prevHeap : heap,
    };
    if (frame && frame.callerLine > 0) step.callerSourceLine = frame.callerLine;
    if (meta.condition !== undefined) step.condition = meta.condition;
    if (printed) step.output = printed;
    if (meta.input !== undefined) step.input = meta.input;
    if (meta.error) step.error = meta.error;
    if (read.length > 0) step.read = read;
    this.mem.takeReads(); // building the snapshot read memory too; that is not the program's doing
    this.prevStack = step.stack;
    this.prevHeap = step.heap;
    this.steps.push(step);
  }

  /**
   * A reference parameter shows the value of a variable that lives somewhere else. When
   * that variable is written, this frame's own version does not move, so the frame must
   * also be rebuilt whenever one of those other places changes.
   */
  private aliasStamp(frame: Frame): string {
    let stamp = "";
    for (const scope of frame.scopes) {
      for (const slot of scope) {
        if (!slot.ref) continue;
        const root = slot.ref.split(".")[0];
        const version = root[0] === "h"
          ? this.mem.heap.get(root)?.version
          : this.mem.frames.find((f) => `s${f.serial}` === root)?.version;
        stamp += `${root}:${version ?? "gone"};`;
      }
    }
    return stamp;
  }

  /** The program printed something. cout parts are printed one at a time, as real C++ does. */
  print(text: string) {
    this.pending += text;
  }

  /** When an object is deleted or a frame returns, pointers that referred to it change meaning. */
  private invalidateAfterDeaths() {
    const deaths = this.mem.deaths.splice(0);
    if (deaths.length === 0) return;
    for (const d of deaths) {
      if (d[0] === "h") this.heapCache.delete(d);
      else if (!this.mem.frames.some((f) => `s${f.serial}` === d)) this.frameCache.delete(Number(d.slice(1)));
    }
    const hit = (refs: Set<string>) => deaths.some((d) => refs.has(d));
    for (const entry of this.heapCache.values()) if (hit(entry.refs)) entry.version = -1;
    for (const entry of this.frameCache.values()) if (hit(entry.refs)) entry.version = -1;
  }

  // ---- building items ------------------------------------------------------

  private addrToId(addr: string): string {
    const parts = addr.split(".");
    if (parts[0][0] === "h") return parts.join("_");
    const depth = this.depth.get(Number(parts[0].slice(1))) ?? 0;
    return [`f${depth}`, ...parts.slice(1)].join("_");
  }

  private buildFrame(frame: Frame, index: number, refs: Set<string>): StackFrame {
    const variables: MemoryItem[] = [];
    if (frame.thisAddr && frame.className) {
      const type: TypeRef = { base: frame.className, ptr: 1, ref: false };
      variables.push(this.build({ k: "ptr", a: frame.thisAddr }, type, false, `f${index}_this`, "this", `${frame.className}* this`, refs));
    }
    for (const scope of frame.scopes) {
      for (const slot of scope) {
        const id = `f${index}_${slot.key}`;
        const suffix = slot.isArray ? dims(slot.value) : "";
        const label = `${typeText(slot.type)} ${slot.name}${suffix}`;
        let value = slot.value;
        if (slot.ref) {
          // A reference parameter shows the value of the variable it refers to.
          refs.add(slot.ref.split(".")[0]);
          try { value = this.mem.read(slot.ref); } catch { value = { k: "uninit" }; }
        }
        variables.push(this.build(value, slot.type, slot.isArray, id, slot.name, label, refs));
      }
    }
    return { id: `f${index}`, callId: frame.serial, name: frame.name, variables };
  }

  private buildHeap(cell: HeapCell, refs: Set<string>): MemoryItem {
    const size = cell.isArray && typeof cell.value === "object" && cell.value.k === "arr" ? cell.value.e.length : 0;
    const label = cell.isArray ? `${typeText(cell.type)}[${size}]` : typeText(cell.type);
    const item = this.build(cell.value, cell.type, cell.isArray, cell.id, "", label, refs);
    item.address = `0x${(cell.n * 0x100).toString(16)}`;
    return item;
  }

  private pointer(base: Omit<MemoryItem, "kind">, p: Ptr, refs: Set<string>): MemoryItem {
    if (p.a === null) return { ...base, kind: "pointer", value: "nullptr" };
    const rootKey = p.a.split(".")[0];
    if (!this.mem.alive(p.a)) {
      const item: MemoryItem = { ...base, kind: "pointer", value: "dangling", dangling: true };
      if (rootKey[0] === "h") item.freedTarget = rootKey;
      return item;
    }
    refs.add(rootKey);
    return { ...base, kind: "pointer", pointsTo: this.addrToId(p.a) };
  }

  private build(v: Value, type: TypeRef, isArray: boolean, id: string, name: string, label: string, refs: Set<string>): MemoryItem {
    const typeName = typeText({ ...type, ref: false });
    const base = { id, label, name, typeName };
    if (typeof v === "number") return { ...base, kind: "scalar", value: String(v) };
    if (typeof v === "boolean") return { ...base, kind: "scalar", value: v ? "true" : "false" };
    switch (v.k) {
      case "uninit": return { ...base, kind: type.ptr > 0 ? "pointer" : "scalar", value: "?" };
      case "dbl": return { ...base, kind: "scalar", value: formatDouble(v.v) };
      case "chr": return { ...base, kind: "scalar", value: showChar(v.c) };
      case "str": return { ...base, kind: "scalar", value: JSON.stringify(v.s) };
      case "ptr": return this.pointer(base, v, refs);
      case "arr": {
        const children = v.e.map((el, i) => this.build(el, type, false, `${id}_${i}`, `[${i}]`, `[${i}]`, refs));
        return { ...base, typeName: `${typeName}[${v.e.length}]`, kind: "array", children };
      }
      case "obj": {
        const cls = this.classes.get(v.type);
        const children = (cls?.fields ?? []).map((f) => {
          const fl = `${typeText(f.type)} ${f.name}${f.arraySize !== null ? `[${f.arraySize}]` : ""}${f.arraySize2 !== null ? `[${f.arraySize2}]` : ""}`;
          return this.build(v.f[f.name] ?? { k: "uninit" }, f.type, f.arraySize !== null, `${id}_${f.name}`, f.name, fl, refs);
        });
        return { ...base, typeName: isArray ? typeName : v.type, kind: "object", children };
      }
    }
  }
}

