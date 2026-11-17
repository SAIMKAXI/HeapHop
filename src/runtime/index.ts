// Public face of the runtime layer.
//
//   const result = await runProgram(code);
//   if (result.ok) show(result.trace); else show(result.error.message);
//
// The interface calls this and nothing else to execute a program.
import type { RunResult } from "@/core/types";
import { createBrowserWorker } from "./browser-worker";
import { Runner, type RunOptions } from "./runner";

export { Runner, type RunOptions } from "./runner";
export { TraceCache } from "./cache";
export type { WorkerLike } from "./protocol";

let shared: Runner | null = null;

/** Run a program in the shared Worker. Safe to call again before the previous run ends. */
export function runProgram(code: string, options?: RunOptions): Promise<RunResult> {
  shared ??= new Runner(createBrowserWorker);
  return shared.run(code, options);
}
