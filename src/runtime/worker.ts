// The Web Worker entry point. The student's program is interpreted here, off the
// page's main thread, so a long run can never freeze the interface.
import { handle } from "./handler";
import type { RunRequest, RunResponse } from "./protocol";

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<RunRequest>) => void) | null;
  postMessage(message: RunResponse): void;
};

scope.onmessage = (event) => {
  scope.postMessage(handle(event.data));
};
