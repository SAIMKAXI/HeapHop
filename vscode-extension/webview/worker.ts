// The panel's Web Worker: the same interpreter as the website, in its extended mode (the STL,
// templates, exceptions and the rest, and up to 50,000 printed characters).
// The student's program runs here, off the panel's main thread, so a long run never
// freezes VS Code's panel.
import { handle } from "@/runtime/handler";
import type { RunRequest, RunResponse } from "@/runtime/protocol";

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<RunRequest>) => void) | null;
  postMessage(message: RunResponse): void;
};

scope.onmessage = (event) => {
  scope.postMessage(handle(event.data, { extended: true }));
};
