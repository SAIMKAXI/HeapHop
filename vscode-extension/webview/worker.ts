// The panel's Web Worker: the same interpreter as the website, with std::list switched on.
// The student's program runs here, off the panel's main thread, so a long run never
// freezes VS Code's panel.
import { handle } from "@/runtime/handler";
import type { RunRequest, RunResponse } from "@/runtime/protocol";

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<RunRequest>) => void) | null;
  postMessage(message: RunResponse): void;
};

scope.onmessage = (event) => {
  scope.postMessage(handle(event.data, { stl: true }));
};
