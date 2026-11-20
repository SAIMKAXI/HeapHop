// What the Worker does with one request. A plain function so it can be unit tested
// without a Worker. Together with worker.ts this is the only code outside src/core that
// may import the interpreter (enforced by the boundary check).
import { run } from "@/core/interpreter";
import { clampLimits } from "@/core/types";
import { PROTOCOL_VERSION, type RunRequest, type RunResponse } from "./protocol";

/** Messages are checked, not trusted: anything that is not exactly a run request is refused. */
function isRunRequest(m: unknown): m is RunRequest {
  if (typeof m !== "object" || m === null) return false;
  const r = m as Record<string, unknown>;
  return r.type === "run" && typeof r.code === "string" && typeof r.input === "string"
    && typeof r.limits === "object" && r.limits !== null && Number.isSafeInteger(r.id);
}

export function handle(request: RunRequest): RunResponse {
  const id = typeof request === "object" && request !== null && Number.isSafeInteger(request.id) ? request.id : -1;
  const reply = (result: RunResponse["result"]): RunResponse => ({ v: PROTOCOL_VERSION, id, type: "result", result });
  if (typeof request === "object" && request !== null && request.v !== PROTOCOL_VERSION) {
    return reply({
      ok: false,
      error: { kind: "internal", message: "HeapHop was updated while this page was open. Reload the page and run again." },
    });
  }
  if (!isRunRequest(request)) {
    return reply({ ok: false, error: { kind: "internal", message: "This is not a valid run request, so nothing was run." } });
  }
  // run() clamps the limits too; a page can lower them but never raise them.
  return reply(run(request.code, clampLimits(request.limits), request.input));
}
