// Small least-recently-used cache for run results. Interpreting the same
// code with the same interpreter version always gives the same trace, so it is safe to
// hand back the earlier one.
import { TRACE_VERSION, type RunLimits, type RunResult } from "@/core/types";
import { INTERPRETER_VERSION } from "@/core/version";

export class TraceCache {
  private entries = new Map<string, RunResult>();

  constructor(private capacity = 12) {}

  private key(code: string, limits: RunLimits, input: string): string {
    return `${INTERPRETER_VERSION}|${TRACE_VERSION}|${Object.values(limits).join(",")}|${input.length}:${input}|${code}`;
  }

  get(code: string, limits: RunLimits, input = ""): RunResult | undefined {
    const key = this.key(code, limits, input);
    const hit = this.entries.get(key);
    if (hit) {
      this.entries.delete(key); // move to the newest position
      this.entries.set(key, hit);
    }
    return hit;
  }

  set(code: string, limits: RunLimits, result: RunResult, input = "") {
    // Results that depend on timing are not facts about the code.
    if (!result.ok && (result.error.kind === "timeout" || result.error.kind === "cancelled" || result.error.kind === "internal")) return;
    const key = this.key(code, limits, input);
    this.entries.delete(key);
    this.entries.set(key, result);
    while (this.entries.size > this.capacity) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
  }

  get size(): number {
    return this.entries.size;
  }
}
