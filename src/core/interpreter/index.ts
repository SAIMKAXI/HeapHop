// Public entry point of the interpreter: C++ source in, RunResult out.
// Nothing outside this folder may import the files next to this one.
import { DEFAULT_LIMITS, TRACE_VERSION, type RunLimits, type RunResult, type Trace } from "../types";
import { tokenize } from "./tokenizer";
import { parse } from "./parser";
import { Executor } from "./executor";
import { SourceError } from "./errors";

/**
 * Interpret a program. `input` is everything the program will read with cin, supplied up front.
 */
export function run(code: string, limits: RunLimits = DEFAULT_LIMITS, input = ""): RunResult {
  try {
    const text = code.replace(/\r\n?/g, "\n");
    const source = text.split("\n");
    const program = parse(tokenize(text));
    const hasMain = program.functions.some((f) => f.name === "main");
    if (!hasMain && program.topLevel.length === 0) {
      return { ok: false, error: { kind: "empty", message: "There is nothing to run yet. Write an int main() { ... } with some statements in it." } };
    }
    const executor = new Executor(program, source, limits, input.replace(/\r\n?/g, "\n"));
    const end = executor.run();
    const trace: Trace = {
      version: TRACE_VERSION,
      status: end.status,
      source,
      output: executor.rec.output,
      steps: executor.rec.steps,
    };
    if (end.notice) trace.notice = end.notice;
    return { ok: true, trace };
  } catch (e) {
    if (e instanceof SourceError) return { ok: false, error: { kind: e.kind, message: e.message, line: e.line } };
    if (e instanceof RangeError) {
      return { ok: false, error: { kind: "unsupported", message: "This program nests too deeply for HeapHop to follow." } };
    }
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, error: { kind: "internal", message: `HeapHop hit an internal problem: ${message}` } };
  }
}
