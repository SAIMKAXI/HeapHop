// Messages between the extension (running in VS Code) and the panel (the webview).
// Plain data only, so both sides can import this file. Every message the extension
// receives is checked with isFromPanel before it is used.

/** Extension -> panel. */
export type ToPanel =
  /** Run this program and draw it. `runId` grows with every run, so stale answers are ignored. */
  | { type: "run"; runId: number; code: string; input: string; fileName: string; fileUri: string }
  /** The editor's cursor is on this line of the visualized file (null: somewhere else). */
  | { type: "focusLine"; line: number | null };

/**
 * How a run turned out, in the terms the extension needs for its Problems entries.
 * `errorLine` is the crash line for status "error" and the last line reached for "truncated".
 */
export type RunSummary =
  | { ok: true; status: "completed" | "error" | "truncated"; steps: number; notice?: string; errorLine?: number; errorMessage?: string }
  | { ok: false; kind: string; message: string; line?: number };

/** Panel -> extension. */
export type FromPanel =
  /** The panel has loaded and can take a run. */
  | { type: "ready" }
  /** The step shown changed. */
  | { type: "step"; runId: number; line: number; callerLine: number | null; error: boolean }
  /** A run finished. */
  | { type: "result"; runId: number; summary: RunSummary }
  /** The student changed the program input (what cin reads). */
  | { type: "input"; text: string }
  /** The student pressed "Run again". */
  | { type: "rerun" }
  /** The student asked to see a line in the editor. */
  | { type: "reveal"; line: number };

const isInt = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v);
const isLine = (v: unknown): v is number => isInt(v) && v >= 0 && v <= 100_000;
const isText = (v: unknown, max: number): v is string => typeof v === "string" && v.length <= max;

function isSummary(s: unknown): s is RunSummary {
  if (typeof s !== "object" || s === null) return false;
  const r = s as Record<string, unknown>;
  if (r.ok === true) {
    return (r.status === "completed" || r.status === "error" || r.status === "truncated") && isInt(r.steps)
      && (r.notice === undefined || isText(r.notice, 2000))
      && (r.errorLine === undefined || isLine(r.errorLine))
      && (r.errorMessage === undefined || isText(r.errorMessage, 2000));
  }
  return r.ok === false && isText(r.kind, 40) && isText(r.message, 2000) && (r.line === undefined || isLine(r.line));
}

/** Messages from the panel are checked, not trusted: anything malformed is dropped. */
export function isFromPanel(m: unknown): m is FromPanel {
  if (typeof m !== "object" || m === null) return false;
  const r = m as Record<string, unknown>;
  switch (r.type) {
    case "ready": case "rerun": return true;
    case "step": return isInt(r.runId) && isLine(r.line) && (r.callerLine === null || isLine(r.callerLine)) && typeof r.error === "boolean";
    case "result": return isInt(r.runId) && isSummary(r.summary);
    case "input": return isText(r.text, 20_000);
    case "reveal": return isLine(r.line) && r.line >= 1;
    default: return false;
  }
}
