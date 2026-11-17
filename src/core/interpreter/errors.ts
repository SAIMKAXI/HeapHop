// Error types used inside the interpreter. None of them escapes run():
// they are turned into a RunError or into an error step of the trace.
import type { RuntimeErrorInfo, TraceStatus } from "../types";

/** The code cannot be parsed, or uses C++ that HeapHop does not handle. */
export class SourceError extends Error {
  constructor(
    public kind: "parse" | "unsupported",
    message: string,
    public line: number
  ) {
    super(message);
  }
}

export function unsupported(what: string, line: number, hint = ""): SourceError {
  const tail = hint ? ` ${hint}` : "";
  return new SourceError("unsupported", `Line ${line}: ${what} is not supported yet.${tail}`, line);
}

export function parseError(message: string, line: number): SourceError {
  return new SourceError("parse", `Line ${line}: ${message}`, line);
}

/** The program did something invalid while running (a crash in real C++). */
export class RuntimeFault extends Error {
  constructor(public info: RuntimeErrorInfo) {
    super(info.message);
  }
}

export function fault(code: RuntimeErrorInfo["code"], message: string): RuntimeFault {
  return new RuntimeFault({ code, message });
}

/** A safety limit was reached. The run stops and the trace is marked truncated. */
export class StopSignal extends Error {
  constructor(
    public status: TraceStatus,
    public notice: string
  ) {
    super(notice);
  }
}
