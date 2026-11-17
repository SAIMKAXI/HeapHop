// Runner: sends a program to the Worker and waits for its trace, with a time limit.
// It never interprets anything itself.
import { DEFAULT_LIMITS, type RunLimits, type RunResult } from "@/core/types";
import { TraceCache } from "./cache";
import { PROTOCOL_VERSION, type RunResponse, type WorkerLike } from "./protocol";

export interface RunnerOptions {
  /** Wall-clock limit for one run. The Worker is killed when it is exceeded. */
  timeoutMs?: number;
  cache?: TraceCache;
}

export interface RunOptions {
  limits?: RunLimits;
  /** Everything the program will read with cin, in order. */
  input?: string;
  /** Skip the cache (used by benchmarks). */
  fresh?: boolean;
}

interface Pending {
  id: number;
  code: string;
  input: string;
  limits: RunLimits;
  resolve: (result: RunResult) => void;
  timer: ReturnType<typeof setTimeout>;
}

const DEFAULT_TIMEOUT_MS = 3000;

export class Runner {
  private worker: WorkerLike | null = null;
  private pending: Pending | null = null;
  private nextId = 1;
  private timeoutMs: number;
  private cache: TraceCache;

  constructor(
    private createWorker: () => WorkerLike,
    options: RunnerOptions = {}
  ) {
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.cache = options.cache ?? new TraceCache();
  }

  /** Interpret `code` in the Worker. Always resolves; problems come back as `{ ok: false }`. */
  run(code: string, options: RunOptions = {}): Promise<RunResult> {
    const limits = options.limits ?? DEFAULT_LIMITS;
    const input = options.input ?? "";
    if (!options.fresh) {
      const hit = this.cache.get(code, limits, input);
      if (hit) return Promise.resolve(hit);
    }
    // Only one run at a time: a newer run replaces one that is still going.
    if (this.pending) {
      this.finish({ ok: false, error: { kind: "cancelled", message: "A newer run replaced this one." } }, true);
    }

    return new Promise<RunResult>((resolve) => {
      const id = this.nextId++;
      const timer = setTimeout(() => {
        if (this.pending?.id !== id) return;
        const seconds = Math.round(this.timeoutMs / 100) / 10;
        this.finish({
          ok: false,
          error: {
            kind: "timeout",
            message: `The program ran for more than ${seconds} seconds, so HeapHop stopped it. It may be stuck in a loop.`,
          },
        }, true);
      }, this.timeoutMs);
      this.pending = { id, code, input, limits, resolve, timer };

      try {
        this.ensureWorker().postMessage({ v: PROTOCOL_VERSION, id, type: "run", code, input, limits });
      } catch (e) {
        this.finish({ ok: false, error: { kind: "internal", message: `HeapHop could not start its worker: ${e instanceof Error ? e.message : String(e)}` } }, true);
      }
    });
  }

  /** Stop the Worker and drop any run in progress. */
  dispose() {
    if (this.pending) this.finish({ ok: false, error: { kind: "cancelled", message: "The run was cancelled." } }, true);
    this.killWorker();
  }

  private ensureWorker(): WorkerLike {
    if (this.worker) return this.worker;
    const worker = this.createWorker();
    worker.onmessage = (event) => this.onMessage(event.data);
    worker.onerror = () => {
      this.finish({ ok: false, error: { kind: "internal", message: "HeapHop's worker stopped unexpectedly. Run the program again." } }, true);
    };
    this.worker = worker;
    return worker;
  }

  private onMessage(response: RunResponse) {
    if (!this.pending || response.id !== this.pending.id) return; // answer to a run we gave up on
    if (response.v !== PROTOCOL_VERSION) {
      this.finish({ ok: false, error: { kind: "internal", message: "HeapHop was updated while this page was open. Reload the page and run again." } }, true);
      return;
    }
    this.finish(response.result, false);
  }

  /** Settle the current run. `kill` discards the Worker, which is the only way to stop a busy one. */
  private finish(result: RunResult, kill: boolean) {
    const p = this.pending;
    if (!p) return;
    this.pending = null;
    clearTimeout(p.timer);
    if (kill) this.killWorker();
    this.cache.set(p.code, p.limits, result, p.input);
    p.resolve(result);
  }

  private killWorker() {
    if (!this.worker) return;
    this.worker.onmessage = null;
    this.worker.onerror = null;
    this.worker.terminate();
    this.worker = null;
  }
}
