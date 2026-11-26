// Public entry point of the interpreter: C++ source in, RunResult out.
// Nothing outside this folder may import the files next to this one.
import { clampLimits, DEFAULT_LIMITS, EXTENSION_LIMITS, MAX_INPUT_CHARS, MAX_SOURCE_CHARS, MAX_SOURCE_LINES, TRACE_VERSION, type RunLimits, type RunResult, type Trace } from "../types";
import { tokenize, type Directives } from "./tokenizer";
import { parse } from "./parser";
import { Executor } from "./executor";
import { SourceError } from "./errors";

/** Parts of C++ a shell switches on beyond the core subset. */
export interface RunFeatures {
  /**
   * The VS Code extension's larger C++: the STL containers and algorithms, auto and range-for,
   * templates, inheritance, exceptions, pointer arithmetic, classes inside classes and more,
   * with the higher EXTENSION_LIMITS. The website does not turn this on.
   */
  extended?: boolean;
}

/**
 * Interpret a program. `input` is everything the program will read with cin, supplied up front.
 */
export function run(code: string, limits: RunLimits = DEFAULT_LIMITS, input = "", features: RunFeatures = {}): RunResult {
  try {
    const text = code.replace(/\r\n?/g, "\n");
    const source = text.split("\n");
    // Size caps come first, so a giant paste is refused before any work is done on it.
    if (source.length > MAX_SOURCE_LINES) {
      const line = MAX_SOURCE_LINES + 1;
      return { ok: false, error: { kind: "unsupported", line, message: `Line ${line}: the program is longer than ${MAX_SOURCE_LINES} lines, which is more than HeapHop can draw. Try a smaller program.` } };
    }
    if (text.length > MAX_SOURCE_CHARS) {
      const line = text.slice(0, MAX_SOURCE_CHARS).split("\n").length;
      return { ok: false, error: { kind: "unsupported", line, message: `Line ${line}: the program is longer than ${MAX_SOURCE_CHARS} characters, which is more than HeapHop can draw. Try a smaller program.` } };
    }
    if (input.length > MAX_INPUT_CHARS) {
      return { ok: false, error: { kind: "unsupported", line: 1, message: `Line 1: the input for cin is longer than ${MAX_INPUT_CHARS} characters. Give the program less input.` } };
    }
    limits = clampLimits(limits, features.extended ? EXTENSION_LIMITS : DEFAULT_LIMITS);
    const directives: Directives = { includes: [], usings: [] };
    const tokens = tokenize(text, directives, features.extended === true);
    const program = parse(tokens, { extended: features.extended === true, ...directives });
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
