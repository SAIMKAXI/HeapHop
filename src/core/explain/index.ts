// Explanation engine (tasks 6.6 and 6.7): plain-language sentences for a step, an
// object and a pointer. Every sentence is built from events that the trace really
// contains, so nothing is claimed that the run did not show.
//
// Text wrapped in `backticks` is code; the interface shows it in a code font.
import type { CellOwner, HistoryEntry, MemoryItem, Step, TraceEvent } from "../types";
import { heapRootOf, pointerTarget, type TraceModel } from "../trace";

type Tone = "info" | "good" | "warn" | "danger";

export interface Sentence {
  text: string;
  tone: Tone;
  /** Heap objects the sentence talks about, for highlighting. */
  objects: string[];
}

const say = (text: string, tone: Tone = "info", objects: (string | null)[] = []): Sentence =>
  ({ text, tone, objects: objects.filter((o): o is string => !!o) });

function findCell(step: Step | undefined, cellId: string): MemoryItem | undefined {
  if (!step) return undefined;
  const walk = (items: MemoryItem[]): MemoryItem | undefined => {
    for (const it of items) {
      if (it.id === cellId) return it;
      if (it.children && cellId.startsWith(it.id)) {
        const hit = walk(it.children);
        if (hit) return hit;
      }
    }
    return undefined;
  };
  for (const f of step.stack) {
    const hit = walk(f.variables);
    if (hit) return hit;
  }
  return walk(step.heap);
}

/** "`head`", "`next` of Node #1", "`head` (in main)". */
export function cellLabel(model: TraceModel, owner: CellOwner, name: string, activeFunction?: string): string {
  if (owner.kind === "object") return `\`${name}\` of ${model.nameOf(owner.id)}`;
  return activeFunction && owner.name !== activeFunction ? `\`${name}\` (in ${owner.name})` : `\`${name}\``;
}

/** "Node #2", "the variable `x`", "nullptr". */
export function targetLabel(model: TraceModel, target: string | null): string {
  if (!target) return "nullptr";
  const root = heapRootOf(target);
  if (root) return model.nameOf(root);
  return `the local variable \`${target.split("_").slice(1).join(".")}\``;
}

function pointerSentence(model: TraceModel, index: number, e: Extract<TraceEvent, { type: "pointer_changed" }>): Sentence {
  const step = model.trace.steps[index];
  const prev = index > 0 ? model.trace.steps[index - 1] : undefined;
  const who = cellLabel(model, e.owner, e.name, step.activeFunction);
  const cell = findCell(step, e.cellId);
  const fromRoot = heapRootOf(e.from), toRoot = heapRootOf(e.to);
  const to = targetLabel(model, e.to), from = targetLabel(model, e.from);
  const refs = [fromRoot, toRoot, e.owner.kind === "object" ? e.owner.id : null];

  if (e.declared) {
    if (e.to) return say(`${who} is created and points at ${to}.`, "info", refs);
    if (cell?.value === "?") {
      return say(`${who} is created but not given a value yet. Until it is assigned, it does not point at anything usable.`, "warn", refs);
    }
    return say(`${who} is created as nullptr: it points at nothing.`, "info", refs);
  }

  // A stack pointer stepping along a link of the node it was on: cur = cur->next.
  // Claimed only when the statement itself reads that link, so `p = nullptr` is not mistaken for it.
  if (e.owner.kind === "frame" && fromRoot) {
    const source = model.trace.source[step.sourceLine - 1] ?? "";
    const was = prev?.heap.find((h) => h.id === fromRoot);
    const link = was?.children?.find((c) => c.kind === "pointer" && c.typeName === `${was.typeName}*` &&
      new RegExp(`->\\s*${c.name}\\b`).test(source) &&
      (toRoot ? heapRootOf(c.pointsTo) === toRoot : !c.pointsTo && !c.dangling && c.value !== "?"));
    if (link && toRoot && toRoot !== fromRoot) {
      return say(`${who} moves along \`${link.name}\` from ${from} to ${to}.`, "info", refs);
    }
    if (link && !e.to && cell?.value !== "?") {
      return say(`${who} follows \`${link.name}\` of ${from}, which is nullptr. ${who} is now nullptr: there is no node after ${from}.`, "info", refs);
    }
  }

  if (e.to && e.from) return say(`${who} now points at ${to} instead of ${from}.`, "info", refs);
  if (e.to) {
    const before = findCell(prev, e.cellId)?.value === "?" ? "it had no value" : "it was nullptr";
    return say(`${who} now points at ${to}. Before, ${before}.`, "info", refs);
  }
  if (e.from) return say(`${who} is set to nullptr. It no longer points at ${from}.`, "info", refs);
  return say(`${who} is set to nullptr.`, "info", refs);
}

function valueSentence(model: TraceModel, index: number, e: Extract<TraceEvent, { type: "value_changed" }>): Sentence {
  const who = cellLabel(model, e.owner, e.name, model.trace.steps[index].activeFunction);
  const refs = [e.owner.kind === "object" ? e.owner.id : null];
  if (e.declared) {
    return e.to === "?"
      ? say(`${who} is created without a value. It holds whatever was in memory until it is assigned.`, "warn", refs)
      : say(`${who} is created with the value ${e.to}.`, "info", refs);
  }
  if (e.from === "?" || e.from === null) return say(`${who} gets its first value: ${e.to}.`, "info", refs);
  return say(`${who} changes from ${e.from} to ${e.to}.`, "info", refs);
}

/** Pointers that still hold the address of a deleted object at this step. */
function danglingAt(model: TraceModel, index: number, objectId: string): string[] {
  const step = model.trace.steps[index];
  const out: string[] = [];
  const walk = (it: MemoryItem, owner: CellOwner, path: string) => {
    const name = !path ? it.name : it.name.startsWith("[") ? `${path}${it.name}` : `${path}.${it.name}`;
    if (it.children) it.children.forEach((c) => walk(c, owner, name));
    else if (it.dangling && it.freedTarget === objectId) out.push(cellLabel(model, owner, name, step.activeFunction));
  };
  step.stack.forEach((f) => f.variables.forEach((v) => walk(v, { kind: "frame", id: f.id, name: f.name }, "")));
  step.heap.forEach((h) => walk(h, { kind: "object", id: h.id, name: h.typeName }, ""));
  return out;
}

const joinWords = (words: string[]) =>
  words.length <= 1 ? words.join("") : `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;

function conditionSentence(step: Step, source: string[]): Sentence | null {
  if (step.condition === undefined) return null;
  const line = (source[step.sourceLine - 1] ?? "").trim();
  const m = /\b(while|if|for)\s*\((.*)\)/.exec(line);
  if (!m) return say(`The condition is ${step.condition}.`);
  let cond = m[2];
  const isLoop = m[1] !== "if";
  if (m[1] === "for") cond = (cond.split(";")[1] ?? cond).trim();
  // `if (x) stmt;` on one line: keep only the balanced condition
  let depth = 0;
  for (let i = 0; i < cond.length; i++) {
    if (cond[i] === "(") depth++;
    else if (cond[i] === ")" && --depth < 0) { cond = cond.slice(0, i); break; }
  }
  const outcome = isLoop
    ? step.condition ? "so the loop body runs" : "so the loop ends"
    : step.condition ? "so the code under this `if` runs" : "so the code under this `if` is skipped";
  return say(`\`${cond.trim()}\` is ${step.condition}, ${outcome}.`);
}

const ERROR_ADVICE: Record<string, string> = {
  null_dereference: "Check that the pointer is not nullptr before using `->` or `*`.",
  use_after_free: "After `delete p;` the pointer still holds the old address. Set it to nullptr, or stop using it.",
  double_free: "Each object created with `new` must be deleted exactly once.",
  invalid_free: "Only delete what `new` returned.",
  uninitialised_pointer: "Give every pointer a value when you declare it, for example `= nullptr`.",
  uninitialised_read: "Give the variable a value before reading it. For a new node, set `next = nullptr`.",
  out_of_bounds: "Valid indexes run from 0 to size - 1.",
  division_by_zero: "Check the divisor before dividing.",
};

/** One short line for an event, used in history lists. */
export function describeEvent(model: TraceModel, entry: HistoryEntry): string {
  const e = entry.event;
  const fn = model.trace.steps[entry.step]?.activeFunction;
  switch (e.type) {
    case "alloc": return `${model.nameOf(e.objectId)} created with new`;
    case "free": return `${model.nameOf(e.objectId)} deleted`;
    case "became_unreachable": return `${model.nameOf(e.objectId)} became unreachable (leaked)`;
    case "pointer_changed": return `${cellLabel(model, e.owner, e.name, fn)} → ${targetLabel(model, e.to)}`;
    case "value_changed": return `${cellLabel(model, e.owner, e.name, fn)} = ${e.to}`;
    case "frame_push": return `${e.functionName}() called`;
    case "frame_pop": return `${e.functionName}() returned`;
    case "output": return `printed ${JSON.stringify(e.text)}`;
  }
}

type CellChange = Extract<TraceEvent, { type: "pointer_changed" | "value_changed" }>;

/** Two stack variables that changed in exactly the same way: a reference and its variable. */
function sameChange(a: CellChange, b: CellChange): boolean {
  return a.owner.kind === "frame" && b.owner.kind === "frame" && !a.declared && !b.declared && a.from === b.from && a.to === b.to;
}

/**
 * What happened at a step. The first sentence is the headline; at most four are returned.
 */
export function explainStep(model: TraceModel, index: number): Sentence[] {
  const view = model.getStep(index);
  const step = view.step;
  const events = view.events;
  const out: Sentence[] = [];

  if (step.kind === "error" && step.error) {
    out.push(say(`The program stops here. ${step.error.message}`, "danger"));
    const advice = ERROR_ADVICE[step.error.code];
    if (advice) out.push(say(advice, "info"));
    return out;
  }
  if (step.kind === "begin") return [say("The program starts. `main` gets a stack frame for its local variables.")];
  if (step.kind === "end") return [say(step.explanation, /never deleted/.test(step.explanation) ? "warn" : "good", step.heap.map((h) => h.id))];

  const of = <T extends TraceEvent["type"]>(type: T) => events.filter((e): e is Extract<TraceEvent, { type: T }> => e.type === type);

  for (const e of of("free")) {
    const name = model.nameOf(e.objectId);
    out.push(say(`${name} is deleted: its memory is given back and the object no longer exists.`, "info", [e.objectId]));
    const left = danglingAt(model, index, e.objectId);
    if (left.length > 0) {
      out.push(say(`${joinWords(left)} still ${left.length === 1 ? "holds" : "hold"} the old address of ${name}. ${left.length === 1 ? "It is a dangling pointer" : "They are dangling pointers"}: using ${left.length === 1 ? "it" : "them"} would be an error.`, "warn", [e.objectId]));
    }
  }
  for (const e of of("became_unreachable")) {
    out.push(say(`No pointer reaches ${model.nameOf(e.objectId)} any more, and it was never deleted. Its memory is leaked: the program can no longer use it or free it.`, "danger", [e.objectId]));
  }
  for (const e of of("alloc")) {
    out.push(say(`\`new\` creates ${model.nameOf(e.objectId)} on the heap.`, "good", [e.objectId]));
  }
  // A reference parameter is another name for a variable in the caller. Both show the
  // same change in the same step; it is explained once, on the real variable.
  const changes = [...of("pointer_changed"), ...of("value_changed")];
  for (const e of changes) {
    const isAlias = changes.some((o) => o !== e && o.type === e.type && sameChange(o, e) && o.owner.id < e.owner.id);
    if (isAlias) continue;
    out.push(e.type === "pointer_changed" ? pointerSentence(model, index, e) : valueSentence(model, index, e));
    const alias = changes.find((o) => o !== e && o.type === e.type && sameChange(e, o) && e.owner.id < o.owner.id);
    if (alias) out.push(say(`\`${alias.name}\` in \`${alias.owner.name}\` is a reference to it, so the change is made through that name.`, "info"));
  }

  const cond = conditionSentence(step, model.trace.source);
  if (cond) out.unshift(cond);

  for (const e of of("frame_push")) {
    const from = step.callerSourceLine ? ` from line ${step.callerSourceLine}` : "";
    out.push(say(`\`${e.functionName}\` is called${from}. It gets its own stack frame for its parameters and local variables.`, "info"));
  }
  for (const e of of("frame_pop")) {
    out.push(say(`\`${e.functionName}\` has returned. Its stack frame and local variables are gone.`, "info"));
  }
  if (step.kind === "return" && out.length === 0) out.push(say(`\`${step.activeFunction}\` is about to return to the line that called it.`));
  if (step.kind === "input" && step.input !== undefined) out.unshift(say(`Reads ${JSON.stringify(step.input)} from the program input.`));
  for (const e of of("output")) out.push(say(`Prints ${JSON.stringify(e.text)}.`, "info"));

  if (out.length === 0) out.push(say("This line changes nothing in memory."));
  return out.slice(0, 4);
}

/** The state of an object at a step, in words. */
export function explainObject(model: TraceModel, objectId: string, index: number): Sentence[] {
  const rec = model.object(objectId);
  if (!rec) return [];
  const out: Sentence[] = [];
  const line = rec.allocLine > 0 ? ` on line ${rec.allocLine}` : "";
  out.push(say(`${rec.displayName} was created with \`new\`${line} (step ${rec.allocStep + 1}).`, "info", [rec.id]));

  if (index < rec.allocStep) {
    out.push(say("At this step it does not exist yet.", "info", [rec.id]));
    return out;
  }
  if (rec.freeStep !== null && index >= rec.freeStep) {
    out.push(say(`It was deleted at step ${rec.freeStep + 1} (line ${model.trace.steps[rec.freeStep].sourceLine}). Its memory was given back.`, "info", [rec.id]));
    const left = danglingAt(model, index, rec.id);
    if (left.length > 0) out.push(say(`${joinWords(left)} still ${left.length === 1 ? "holds" : "hold"} its old address (dangling).`, "warn", [rec.id]));
    return out;
  }

  const view = model.getStep(index);
  const step = view.step;
  const refs = view.incoming(rec.id).map((r) => cellLabel(model, r.owner, r.name, step.activeFunction));
  const item = view.heapObject(rec.id);
  if (refs.length === 0) {
    out.push(say(item?.orphaned
      ? "Nothing points at it and it was never deleted: it is leaked. That is different from being deleted: the memory is still taken, but the program has lost the only way to reach it."
      : "Nothing points at it directly at this step.", item?.orphaned ? "danger" : "info", [rec.id]));
  } else {
    out.push(say(`${refs.length === 1 ? "One pointer reaches" : `${refs.length} pointers reach`} it now: ${joinWords(refs)}.`, "info", [rec.id]));
    if (item?.orphaned) out.push(say("Those pointers are inside objects that are unreachable themselves, so this object is leaked too.", "danger", [rec.id]));
  }
  for (const field of item?.children ?? []) {
    if (field.kind !== "pointer") continue;
    const last = model.lastChangeOf(field.id, index);
    const target = field.dangling ? "a deleted object" : field.value === "?" ? "nothing yet (no value)" : targetLabel(model, pointerTarget(field));
    const when = !last ? "" : last.event.type === "alloc"
      ? " It has not changed since the object was created."
      : ` Last changed on line ${last.sourceLine}: \`${(model.trace.source[last.sourceLine - 1] ?? "").trim()}\`.`;
    out.push(say(`Its \`${field.name}\` points at ${target}.${when}`, field.dangling ? "warn" : "info", [rec.id, heapRootOf(field.pointsTo)]));
  }
  return out;
}

export interface PointerStory {
  cellId: string;
  /** "`head`" or "`next` of Node #1" */
  label: string;
  owner: CellOwner;
  /** Where it points now, in words. */
  target: string;
  targetId: string | null;
  /** Where it pointed before its last change; null if it never pointed elsewhere. */
  previous: string | null;
  previousId: string | null;
  /** The statement that last changed it. */
  lastChange: { step: number; line: number; source: string } | null;
  state: "points" | "null" | "uninitialised" | "dangling";
  sentences: Sentence[];
}

/** Everything about one pointer cell at a step. */
export function explainPointer(model: TraceModel, cellId: string, index: number): PointerStory | null {
  const step = model.trace.steps[index];
  const cell = findCell(step, cellId);
  if (!cell || cell.kind !== "pointer") return null;

  let owner: CellOwner;
  const root = heapRootOf(cellId);
  let name = cell.name;
  if (root) {
    owner = { kind: "object", id: root, name: model.object(root)?.typeName ?? "" };
  } else {
    const frame = step.stack.find((f) => cellId.startsWith(`${f.id}_`));
    owner = { kind: "frame", id: frame?.id ?? "", name: frame?.name ?? "" };
    name = cellId.slice((frame?.id.length ?? 0) + 1).replace(/_/g, ".");
  }
  const label = cellLabel(model, owner, name, step.activeFunction);
  const state: PointerStory["state"] = cell.pointsTo ? "points" : cell.dangling ? "dangling" : cell.value === "?" ? "uninitialised" : "null";
  const targetId = cell.pointsTo ?? null;
  const target = state === "points" ? targetLabel(model, targetId)
    : state === "dangling" ? `${cell.freedTarget ? model.nameOf(cell.freedTarget) : "an object"}, which was deleted`
    : state === "uninitialised" ? "nothing usable: it has no value yet" : "nullptr";

  const last = model.lastChangeOf(cellId, index);
  const change = last && last.event.type === "pointer_changed" ? last.event : null;
  const lastChange = last ? { step: last.step, line: last.sourceLine, source: (model.trace.source[last.sourceLine - 1] ?? "").trim() } : null;
  const previousId = change && !change.declared ? change.from : null;
  const previous = change && !change.declared ? targetLabel(model, change.from) : null;

  const sentences: Sentence[] = [];
  sentences.push(say(
    owner.kind === "frame"
      ? `${label} is a local variable of \`${owner.name}\`. It lives on the stack and disappears when \`${owner.name}\` returns.`
      : `${label} is a field stored inside ${model.nameOf(owner.id)} on the heap.`,
    "info", [owner.kind === "object" ? owner.id : null]));
  sentences.push(say(`It points at ${target}.`, state === "dangling" ? "danger" : state === "uninitialised" ? "warn" : "info", [heapRootOf(targetId)]));
  if (state === "dangling") sentences.push(say("The pointer was not changed when the object was deleted, so it still holds the old address. Using it would be an error.", "warn"));
  if (lastChange) {
    sentences.push(say(
      last!.event.type === "alloc"
        ? `It has had this value since ${model.nameOf(owner.id)} was created on line ${lastChange.line}.`
        : `It got this value on line ${lastChange.line}: \`${lastChange.source}\`.${previous ? ` Before that it pointed at ${previous}.` : ""}`,
      "info", [heapRootOf(previousId)]));
  }
  return { cellId, label, owner, target, targetId, previous, previousId, lastChange, state, sentences };
}
