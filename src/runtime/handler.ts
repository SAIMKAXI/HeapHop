// What the Worker does with one request. A plain function so it can be unit tested
// without a Worker. Together with worker.ts this is the only code outside src/core that
// may import the interpreter (enforced by the boundary check).
import { run } from "@/core/interpreter";
import { PROTOCOL_VERSION, type RunRequest, type RunResponse } from "./protocol";

export function handle(request: RunRequest): RunResponse {
  const reply = (result: RunResponse["result"]): RunResponse => ({ v: PROTOCOL_VERSION, id: request.id, type: "result", result });
  if (request.v !== PROTOCOL_VERSION) {
    return reply({
      ok: false,
      error: { kind: "internal", message: "HeapHop was updated while this page was open. Reload the page and run again." },
    });
  }
  return reply(run(request.code, request.limits, request.input));
}
