/**
 * HeapHop trace contract. Version 2 added the "input" step kind for cin; version 4 added Step.read.
 *
 * This file is the ONLY shape that crosses between layers. The interpreter
 * produces a Trace; the runtime, the trace index, the layout engine, the
 * explanation engine and the interface all consume it. Nothing outside
 * src/core/interpreter may depend on how the interpreter works inside.
 *
 * Changing a field here is a contract change: bump TRACE_VERSION.
 */

/** Bumped whenever the shape below changes in a way old consumers would misread. */
export const TRACE_VERSION = 4;

// ---------------------------------------------------------------------------
// Memory snapshot
// ---------------------------------------------------------------------------

/** What a memory cell is. `object` and `array` have `children`. */
export type MemoryKind = "scalar" | "pointer" | "object" | "array";

/**
 * One cell of memory: a stack variable, a heap object, or a field inside one.
 *
 * Identity rules:
 *  - `id` is unique within a step and stable across steps for the same cell.
 *  - Heap object ids look like "h3". They are never reused after `delete`,
 *    unlike real addresses, so "h3" always means the same allocation.
 *  - Field ids extend their owner: "h3_next". Stack variables: "f0_head"
 *    (frame 0 = main, counted from the bottom of the stack).
 */
export interface MemoryItem {
  id: string;
  /** Text shown on the cell, e.g. "Node* head" or "Node". */
  label: string;
  /** Variable or field name ("head", "next"). Empty for a top-level heap object. */
  name: string;
  /** C++ type as written ("Node*", "int", "Node"). */
  typeName: string;
  kind: MemoryKind;
  /** Pretend address for display only ("0x100"). Never use it as identity. */
  address?: string;
  /** Printed value for scalars; "nullptr" for a null pointer; "?" when uninitialised. */
  value?: string;
  /** For a pointer: the id of the cell it points at. Absent when null or uninitialised. */
  pointsTo?: string;
  /** For a pointer: true when it holds the address of an object that was deleted. */
  dangling?: boolean;
  /** For a dangling pointer: the id of the deleted object whose address it still holds. */
  freedTarget?: string;
  /** Fields of an object, or elements of an array. */
  children?: MemoryItem[];
  /** Heap object that no pointer can reach any more and that was never deleted. */
  orphaned?: boolean;
  /** This cell's value or target differs from the previous step. */
  changed?: boolean;
}

export interface StackFrame {
  /** "f0", "f1"...: position from the bottom of the stack. Stable while the call is alive. */
  id: string;
  /** Unique per call. Two different calls that sit at the same depth share an `id` but not a `callId`. */
  callId: number;
  /** Function name. Methods are "LinkedList::insertAtEnd". */
  name: string;
  variables: MemoryItem[];
}

// ---------------------------------------------------------------------------
// Steps
// ---------------------------------------------------------------------------

/**
 * What kind of moment a step records. The explanation engine and the timeline
 * use this instead of guessing from the text of the source line.
 */
export type StepKind =
  | "begin" // before the first statement
  | "statement" // an ordinary statement ran
  | "condition" // an if / while / for / do-while condition was evaluated
  | "call" // a function or method was entered
  | "return" // a return statement ran
  | "output" // a cout statement printed something
  | "input" // a cin statement read from the program input (see Step.input)
  | "error" // the program crashed here (see Step.error)
  | "end"; // the program finished

export interface RuntimeErrorInfo {
  /** Machine-readable category. */
  code:
    | "null_dereference"
    | "use_after_free"
    | "double_free"
    | "invalid_free"
    | "out_of_bounds"
    | "division_by_zero"
    | "uninitialised_pointer" // followed a pointer that was never given a value
    | "uninitialised_read" // used a variable's value before it was given one
    | "other";
  /** Plain-language message for the student. */
  message: string;
}

export interface Step {
  kind: StepKind;
  /** 1-based line in the student's source. 0 when the step has no line ("begin"). */
  sourceLine: number;
  /** Function executing at this step ("main", "LinkedList::display"). */
  activeFunction: string;
  /** 1-based source line of the call that entered the active function. */
  callerSourceLine?: number;
  /** For kind "condition": what the condition evaluated to. */
  condition?: boolean;
  /** For kind "error". */
  error?: RuntimeErrorInfo;
  /** Short label: the trimmed source line. The explanation engine writes real sentences. */
  explanation: string;
  /** For kind "input": the text this step consumed from the program input. */
  input?: string;
  /** Array elements this step read, by cell id (e.g. the two cells a comparison looked at). */
  read?: string[];
  /** Text printed by this step, exactly as the program would print it (newlines included). */
  output?: string;
  /** Bottom of the stack first: stack[0] is main. */
  stack: StackFrame[];
  heap: MemoryItem[];

}

// ---------------------------------------------------------------------------
// Trace
// ---------------------------------------------------------------------------

/** How the run ended. */
export type TraceStatus =
  | "completed" // ran to the end
  | "error" // stopped at a runtime error; the last step has kind "error"
  | "truncated"; // stopped by a safety limit; see Trace.notice

export interface Trace {
  version: number;
  status: TraceStatus;
  /** Present when status is "truncated" or "error": one sentence for the student. */
  notice?: string;
  /** The student's source, one entry per line. `Step.sourceLine` indexes this (1-based). */
  source: string[];
  /** Everything the program printed, in order. */
  output: string;
  steps: Step[];
}

// ---------------------------------------------------------------------------
// Running a program
// ---------------------------------------------------------------------------

/** Why no trace could be produced at all. (Crashes DURING a run still produce a trace.) */
export interface RunError {
  kind:
    | "parse" // the code is not valid for the supported subset
    | "unsupported" // valid C++ that HeapHop does not handle yet
    | "empty" // nothing to run
    | "timeout" // the worker was stopped by the time limit
    | "cancelled" // a newer run replaced this one before it finished
    | "internal"; // a bug in HeapHop
  message: string;
  /** 1-based source line, when known. */
  line?: number;
}

export type RunResult = { ok: true; trace: Trace } | { ok: false; error: RunError };

/** Safety limits. The interpreter stops and returns a truncated trace when one is hit. */
export interface RunLimits {
  maxSteps: number;
  maxLoopIterations: number;
  maxCallDepth: number;
  maxHeapObjects: number;
  maxOutputChars: number;
}

export const DEFAULT_LIMITS: RunLimits = {
  maxSteps: 2000,
  maxLoopIterations: 500,
  maxCallDepth: 64,
  maxHeapObjects: 500,
  maxOutputChars: 20000,
};

/** Hard caps that no request can raise. The longest lab program is under 300 lines and 6 KB. */
export const MAX_SOURCE_CHARS = 100_000;
export const MAX_SOURCE_LINES = 3_000;
export const MAX_INPUT_CHARS = 20_000;
export const MAX_STRING_CHARS = 10_000;

/** The limits a run actually gets: what was asked for, but never above the defaults or below 1. */
export function clampLimits(asked: Partial<RunLimits> | undefined): RunLimits {
  const out = { ...DEFAULT_LIMITS };
  for (const key of Object.keys(DEFAULT_LIMITS) as (keyof RunLimits)[]) {
    const v = asked?.[key];
    if (typeof v === "number" && Number.isFinite(v)) out[key] = Math.max(1, Math.min(Math.floor(v), DEFAULT_LIMITS[key]));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Events and indexes (built in src/core/trace from the snapshots)
// ---------------------------------------------------------------------------

/** Where a pointer or value lives: a stack frame or a heap object. */
export interface CellOwner {
  kind: "frame" | "object";
  /** Frame id ("f1") or heap object id ("h3"). */
  id: string;
  /** Function name for a frame; type name for an object. */
  name: string;
}

/**
 * One thing that changed between two consecutive steps. Derived by comparing
 * snapshots, so an event exists only if the trace really shows it.
 */
export type TraceEvent =
  | { type: "alloc"; objectId: string; typeName: string }
  | { type: "free"; objectId: string; typeName: string }
  | {
      type: "pointer_changed";
      /** Id of the pointer cell that changed ("f0_head", "h2_next"). */
      cellId: string;
      owner: CellOwner;
      /** Variable or field name ("head", "next"). */
      name: string;
      /** Previous target object id; null when it was null or uninitialised. */
      from: string | null;
      /** New target object id; null when it is now null. */
      to: string | null;
      /** True when the cell did not exist in the previous step (a fresh declaration). */
      declared: boolean;
    }
  | {
      type: "value_changed";
      cellId: string;
      owner: CellOwner;
      name: string;
      from: string | null;
      to: string;
      declared: boolean;
    }
  | { type: "frame_push"; frameId: string; functionName: string }
  | { type: "frame_pop"; frameId: string; functionName: string }
  | { type: "became_unreachable"; objectId: string; typeName: string }
  | { type: "output"; text: string };

/** One entry in an object's life story. */
export interface HistoryEntry {
  /** Index into Trace.steps. */
  step: number;
  sourceLine: number;
  event: TraceEvent;
}

/** A pointer that refers to an object at some step. */
export interface IncomingRef {
  /** Id of the pointer cell. */
  cellId: string;
  owner: CellOwner;
  /** "head", "next"... */
  name: string;
}

/** Everything known about one heap object across the whole run. */
export interface ObjectRecord {
  /** Heap id ("h2"). */
  id: string;
  typeName: string;
  /** Friendly, stable number by allocation order within its type: Node #1, Node #2. */
  number: number;
  /** "Node #2" */
  displayName: string;
  allocStep: number;
  allocLine: number;
  /** Step at which it was deleted, or null if it never was. */
  freeStep: number | null;
  /** First step at which nothing could reach it while it was still allocated, or null. */
  unreachableStep: number | null;
  /** Every event that touched this object or a pointer to it, oldest first. */
  history: HistoryEntry[];
}
