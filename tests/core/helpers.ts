import assert from "node:assert/strict";
import { run } from "../../src/core/interpreter";
import type { MemoryItem, RunLimits, Step, Trace } from "../../src/core/types";

export const NODE = `struct Node { int data; Node* next; Node(int d) : data(d), next(nullptr) {} };`;

/** Run a program that must produce a trace. */
export function trace(code: string, limits?: RunLimits): Trace {
  const r = run(code, limits);
  if (!r.ok) assert.fail(`expected a trace, got ${r.error.kind} error: ${r.error.message}`);
  return r.trace;
}

/** Run a program that must be rejected before it runs. */
export function rejected(code: string) {
  const r = run(code);
  if (r.ok) assert.fail("expected the program to be rejected");
  return r.error;
}

/** The last step while main is still alive (the "end" step has an empty stack). */
export function lastLive(t: Trace): Step {
  const live = t.steps.filter((s) => s.kind !== "end");
  return live[live.length - 1];
}

export function last(t: Trace): Step {
  return t.steps[t.steps.length - 1];
}

export function variable(step: Step, name: string, frame = step.stack.length - 1): MemoryItem {
  const v = step.stack[frame].variables.find((x) => x.name === name);
  if (!v) assert.fail(`no variable "${name}" in frame ${step.stack[frame].name}`);
  return v;
}

export function field(item: MemoryItem, name: string): MemoryItem {
  const f = item.children?.find((c) => c.name === name);
  if (!f) assert.fail(`no field "${name}" in ${item.label}`);
  return f;
}
