// What the extension needs to know about a finished run (for the Problems panel).
import type { RunResult } from "@/core/types";
import type { RunSummary } from "../src/protocol";

/** What the extension needs to know about a finished run (for the Problems panel). */
export function summarize(result: RunResult): RunSummary {
  if (!result.ok) return { ok: false, kind: result.error.kind, message: result.error.message, line: result.error.line };
  const t = result.trace;
  const last = t.steps[t.steps.length - 1];
  const summary: RunSummary = { ok: true, status: t.status, steps: t.steps.length };
  if (t.notice) summary.notice = t.notice;
  if (t.status === "error" && last?.kind === "error") {
    summary.errorLine = last.sourceLine;
    if (last.error) summary.errorMessage = last.error.message;
  }
  if (t.status === "truncated") {
    const reached = [...t.steps].reverse().find((s) => s.sourceLine > 0);
    if (reached) summary.errorLine = reached.sourceLine;
  }
  return summary;
}
