// TraceModel: everything the interface asks about a trace, computed once (tasks 4.2 to 4.6).
//
//   const model = new TraceModel(trace);
//   model.object("h2")              -> its record: "Node #2", when it was created, its history
//   model.getStep(14).incoming("h2") -> who points at it at step 14
//   model.stepsOnLine(12)           -> every step that executed source line 12
//
// This file reads only the Trace contract. It never imports the interpreter.
import type { HistoryEntry, IncomingRef, MemoryItem, ObjectRecord, Step, Trace, TraceEvent } from "../types";
import { diffSteps, heapRootOf } from "./diff";
import { buildIncomingRefs } from "./refs";

/** One step together with the data derived from it. */
export interface StepView {
  index: number;
  step: Step;
  /** What changed compared with the previous step. */
  events: TraceEvent[];
  /** Pointers that refer to a heap object at this step. */
  incoming(objectId: string): IncomingRef[];
  /** A heap object as it looks at this step, or undefined if it does not exist here. */
  heapObject(objectId: string): MemoryItem | undefined;
}

const NO_REFS: IncomingRef[] = [];

export class TraceModel {
  readonly trace: Trace;
  /** events[i] = what changed from step i-1 to step i. */
  readonly events: TraceEvent[][];
  private objects = new Map<string, ObjectRecord>();
  private lines = new Map<number, number[]>();
  private views: (StepView | undefined)[];
  /** printedUntil[i] = characters printed by steps 0..i. */
  private printedUntil: number[] = [];

  constructor(trace: Trace) {
    this.trace = trace;
    this.views = new Array(trace.steps.length);
    this.events = new Array(trace.steps.length);
    const perType = new Map<string, number>();

    let printed = 0;
    trace.steps.forEach((step, i) => {
      const events = diffSteps(i === 0 ? null : trace.steps[i - 1], step);
      this.events[i] = events;
      printed += step.output?.length ?? 0;
      this.printedUntil[i] = printed;

      if (step.sourceLine > 0) {
        const list = this.lines.get(step.sourceLine);
        if (list) list.push(i);
        else this.lines.set(step.sourceLine, [i]);
      }

      for (const event of events) {
        const entry: HistoryEntry = { step: i, sourceLine: step.sourceLine, event };
        const touched = new Set<string>();
        switch (event.type) {
          case "alloc": {
            const number = (perType.get(event.typeName) ?? 0) + 1;
            perType.set(event.typeName, number);
            this.objects.set(event.objectId, {
              id: event.objectId, typeName: event.typeName, number,
              displayName: `${event.typeName} #${number}`,
              allocStep: i, allocLine: step.sourceLine, freeStep: null, unreachableStep: null, history: [],
            });
            touched.add(event.objectId);
            break;
          }
          case "free": {
            const rec = this.objects.get(event.objectId);
            if (rec) rec.freeStep = i;
            touched.add(event.objectId);
            break;
          }
          case "became_unreachable": {
            const rec = this.objects.get(event.objectId);
            if (rec && rec.unreachableStep === null) rec.unreachableStep = i;
            touched.add(event.objectId);
            break;
          }
          case "pointer_changed": {
            // The object that holds the pointer, the one it left and the one it now reaches.
            if (event.owner.kind === "object") touched.add(event.owner.id);
            for (const id of [heapRootOf(event.from), heapRootOf(event.to)]) if (id) touched.add(id);
            break;
          }
          case "value_changed":
            if (event.owner.kind === "object") touched.add(event.owner.id);
            break;
        }
        for (const id of touched) this.objects.get(id)?.history.push(entry);
      }
    });
  }

  get length(): number {
    return this.trace.steps.length;
  }

  /** Everything the program has printed up to and including step `i`. */
  outputUntil(i: number): string {
    return this.trace.output.slice(0, this.printedUntil[Math.max(0, Math.min(i, this.length - 1))] ?? 0);
  }

  /** The step at `i` with its derived data. Built on first use, then reused. */
  getStep(i: number): StepView {
    const index = Math.max(0, Math.min(i, this.trace.steps.length - 1));
    const cached = this.views[index];
    if (cached) return cached;
    const step = this.trace.steps[index];
    let refs: Map<string, IncomingRef[]> | null = null;
    let byId: Map<string, MemoryItem> | null = null;
    const view: StepView = {
      index,
      step,
      events: this.events[index],
      incoming: (objectId) => (refs ??= buildIncomingRefs(step)).get(objectId) ?? NO_REFS,
      heapObject: (objectId) => (byId ??= new Map(step.heap.map((h) => [h.id, h]))).get(objectId),
    };
    this.views[index] = view;
    return view;
  }

  /** Record of a heap object. Accepts the id of the object or of any cell inside it. */
  object(id: string): ObjectRecord | undefined {
    return this.objects.get(heapRootOf(id) ?? id);
  }

  /** Every object that existed during the run, in allocation order. */
  allObjects(): ObjectRecord[] {
    return [...this.objects.values()];
  }

  /** "Node #2" for "h2" (or for "h2_next"); the id itself when unknown. */
  nameOf(id: string): string {
    return this.object(id)?.displayName ?? id;
  }

  /** Is the object allocated (not yet deleted) at this step? */
  isAlive(id: string, stepIndex: number): boolean {
    const rec = this.object(id);
    return !!rec && rec.allocStep <= stepIndex && (rec.freeStep === null || stepIndex < rec.freeStep);
  }

  /** Steps that executed a source line, in order. */
  stepsOnLine(line: number): number[] {
    return this.lines.get(line) ?? [];
  }

  /** The next step after `from` that executes `line`; wraps to the first one. -1 if the line never ran. */
  nextStepOnLine(line: number, from: number): number {
    const list = this.stepsOnLine(line);
    if (list.length === 0) return -1;
    return list.find((s) => s > from) ?? list[0];
  }

  /**
   * Last event before or at `stepIndex` that changed the given cell (pointer or value).
   * A field that was never changed after its object was created returns the allocation.
   */
  lastChangeOf(cellId: string, stepIndex: number): HistoryEntry | null {
    for (let i = Math.min(stepIndex, this.events.length - 1); i >= 0; i--) {
      for (const event of this.events[i]) {
        if ((event.type === "pointer_changed" || event.type === "value_changed") && event.cellId === cellId) {
          return { step: i, sourceLine: this.trace.steps[i].sourceLine, event };
        }
      }
    }
    const rec = this.object(cellId);
    const born = rec?.history[0];
    return born && born.event.type === "alloc" && born.step <= stepIndex ? born : null;
  }
}
