// What is selected, and what else should light up because of it.
// One selection is shared by the canvas, the code panel and the timeline.
import type { TraceEvent } from "../types";
import { heapRootOf } from "./diff";
import type { TraceModel } from "./model";

export type Selection =
  | { kind: "object"; id: string }
  | { kind: "pointer"; cellId: string }
  | { kind: "line"; line: number };

export interface Highlights {
  /** Heap objects to outline on the canvas. */
  objects: Set<string>;
  /** Source lines to mark in the code panel. */
  lines: Set<number>;
  /** Steps to mark on the timeline, in order. */
  steps: number[];
}

const NO_HIGHLIGHTS: Highlights = { objects: new Set(), lines: new Set(), steps: [] };

/** Heap objects an event is about. */
export function objectsOfEvent(event: TraceEvent): string[] {
  switch (event.type) {
    case "alloc": case "free": case "became_unreachable": return [event.objectId];
    case "pointer_changed": {
      const ids = [heapRootOf(event.from), heapRootOf(event.to), event.owner.kind === "object" ? event.owner.id : null];
      return ids.filter((id): id is string => !!id);
    }
    case "value_changed": return event.owner.kind === "object" ? [event.owner.id] : [];
    default: return [];
  }
}

export function highlightsFor(model: TraceModel, selection: Selection | null): Highlights {
  if (!selection) return NO_HIGHLIGHTS;
  const objects = new Set<string>();
  const lines = new Set<number>();
  const steps: number[] = [];
  const addStep = (step: number, line: number) => {
    if (steps[steps.length - 1] !== step) steps.push(step);
    if (line > 0) lines.add(line);
  };

  if (selection.kind === "object") {
    const rec = model.object(selection.id);
    if (rec) {
      objects.add(rec.id);
      for (const h of rec.history) addStep(h.step, h.sourceLine);
    }
  } else if (selection.kind === "pointer") {
    const owner = heapRootOf(selection.cellId);
    if (owner) objects.add(owner);
    model.events.forEach((events, i) => {
      for (const e of events) {
        if (e.type === "pointer_changed" && e.cellId === selection.cellId) {
          addStep(i, model.trace.steps[i].sourceLine);
          for (const id of [heapRootOf(e.from), heapRootOf(e.to)]) if (id) objects.add(id);
        }
      }
    });
  } else {
    lines.add(selection.line);
    for (const i of model.stepsOnLine(selection.line)) {
      steps.push(i);
      for (const e of model.events[i]) for (const id of objectsOfEvent(e)) objects.add(id);
    }
  }
  return { objects, lines, steps };
}
