// Creates the real Web Worker in a browser. The `new URL(..., import.meta.url)` form is
// what bundlers look for to emit the worker as its own file.
import type { WorkerLike } from "./protocol";

export function createBrowserWorker(): WorkerLike {
  return new Worker(new URL("./worker.ts", import.meta.url), { type: "module" }) as unknown as WorkerLike;
}
