// Messages between the page and the interpreter Worker.
// Both sides check `v`, so a stale cached worker script can never be misread.
import type { RunLimits, RunResult } from "@/core/types";

export const PROTOCOL_VERSION = 2;

export interface RunRequest {
  v: number;
  /** Echoed back in the response so the page can match answers to questions. */
  id: number;
  type: "run";
  code: string;
  /** Everything the program will read with cin. */
  input: string;
  limits: RunLimits;
}

export interface RunResponse {
  v: number;
  id: number;
  type: "result";
  result: RunResult;
}

/** The part of a Worker that the runner uses. A fake one stands in for it in tests. */
export interface WorkerLike {
  postMessage(message: RunRequest): void;
  terminate(): void;
  onmessage: ((event: { data: RunResponse }) => void) | null;
  onerror: ((event: unknown) => void) | null;
}
