// Hostile programs. HeapHop is used by security students, who will try to break it.
// Every program here must end safely: a readable error with a line number, or a trace
// that stops at a limit. Never a hang, a crash, a wrong answer or anything outside the
// interpreter.
import { test } from "node:test";
import assert from "node:assert/strict";
import { run } from "../../src/core/interpreter";
import { MAX_INPUT_CHARS, MAX_SOURCE_CHARS, MAX_SOURCE_LINES, MAX_STRING_CHARS } from "../../src/core/types";

const H = "#include <iostream>\nusing namespace std;\n";
const BUDGET_MS = 1500;

/** Run and return the result, failing if it took longer than the budget. */
function timed(code: string, input = "") {
  const t0 = performance.now();
  const r = run(code, undefined, input);
  const ms = performance.now() - t0;
  assert.ok(ms < BUDGET_MS, `took ${Math.round(ms)} ms`);
  return r;
}

function rejected(code: string, pattern: RegExp) {
  const r = timed(code);
  assert.equal(r.ok, false, "the program must be refused");
  if (r.ok) return;
  assert.notEqual(r.error.kind, "internal", r.error.message);
  assert.match(r.error.message, pattern);
  assert.ok(r.error.line !== undefined || /^Line \d+/.test(r.error.message), `has a line number: ${r.error.message}`);
}

function stopped(code: string, pattern: RegExp) {
  const r = timed(code);
  assert.ok(r.ok, r.ok ? "" : r.error.message);
  if (!r.ok) return;
  assert.equal(r.trace.status, "truncated");
  assert.match(r.trace.notice ?? "", pattern);
}

test("no way to reach the operating system: system, asm, files and processes are refused with a line number", () => {
  rejected(H + "#include <cstdlib>\nint main() {\nsystem(\"rm -rf /\");\nreturn 0; }", /Line 5/);
  rejected(H + "int main() {\nasm(\"int $0x80\");\nreturn 0; }", /Line 4/);
  rejected(H + "#include <fstream>\nint main() {\nofstream f(\"/etc/passwd\");\nreturn 0; }", /Line 5/);
  rejected(H + "#include <cstdio>\nint main() {\nFILE* f = fopen(\"x\", \"w\");\nreturn 0; }", /Line 5/);
  rejected(H + "int main() {\nexecl(\"/bin/sh\", \"sh\", NULL);\nreturn 0; }", /Line 4/);
  rejected(H + "int main() {\nint x = fork();\nreturn 0; }", /Line 4/);
});

test("runaway programs stop at a limit instead of hanging", () => {
  stopped(H + "int main() { while (true) {} return 0; }", /limit|stops/);
  stopped(H + "int f(int n) { return f(n + 1); }\nint main() { f(0); return 0; }", /limit|stops|calls/);
  stopped(H + "struct N { N* next; };\nint main() { while (true) { N* n = new N(); } return 0; }", /limit|stops|objects/);
  stopped(H + "int main() { while (true) { cout << \"spam spam spam spam\"; } return 0; }", /limit|stops|printed/);
});

test("huge allocations are refused, not attempted", () => {
  rejected(H + "int main() {\nint a[100000000];\nreturn 0; }", /size/);
  const r = timed(H + "int main() {\nint* a = new int[2000000000];\nreturn 0; }");
  assert.ok(!r.ok || r.trace.status !== "completed");
});

test(`a string that keeps growing stops at ${MAX_STRING_CHARS} characters with a clear message`, () => {
  stopped(H + "#include <string>\nint main() { string s = \"ab\"; while (true) s = s + s; return 0; }", /string.*characters/);
  stopped(H + "#include <string>\nint main() { string s = \"x\"; for (int i = 0; i < 30; i++) s += s; return 0; }", /string.*characters/);
});

test("JavaScript's own property names work as ordinary C++ names, with the same output as g++", () => {
  const code = `${H}
struct constructor {
    int __proto__;
    int toString;
    int hasOwnProperty;
    constructor* valueOf;
};

int prototype(int __defineGetter__) {
    return __defineGetter__ * 2;
}

int main() {
    constructor* c = new constructor();
    c->__proto__ = 1;
    c->toString = 2;
    c->hasOwnProperty = 3;
    c->valueOf = NULL;
    int isPrototypeOf = prototype(c->__proto__ + c->toString + c->hasOwnProperty);
    cout << isPrototypeOf << " " << (c->valueOf == NULL) << endl;
    delete c;
    return 0;
}`;
  const r = timed(code);
  assert.ok(r.ok, r.ok ? "" : r.error.message);
  if (r.ok) {
    assert.equal(r.trace.status, "completed");
    assert.equal(r.trace.output, "12 1\n"); // g++
  }
  rejected(H + "int main() {\nint x = toString(1);\nreturn 0; }", /not a function|not declared/);
  rejected(H + "int main() {\nint x = constructor(1);\nreturn 0; }", /not a function|not declared/);
  const obj = timed(H + "struct A { int x; };\nint main() {\nA a;\na.x = 1;\ncout << a.constructor;\nreturn 0; }");
  assert.ok(!obj.ok || obj.trace.status === "error", "a member that was never declared is an error");
});

test(`programs longer than ${MAX_SOURCE_LINES} lines or ${MAX_SOURCE_CHARS} characters are refused straight away`, () => {
  rejected(H + "int main() {\n" + "int x = 1;\n".repeat(MAX_SOURCE_LINES) + "return 0; }", /longer than/);
  rejected(H + "int main() { int x = 1; } // " + "a".repeat(MAX_SOURCE_CHARS), /longer than/);
});

test(`input for cin is capped at ${MAX_INPUT_CHARS} characters`, () => {
  const r = timed(H + "int main() {\nint x;\ncin >> x;\nreturn 0; }", "1 ".repeat(MAX_INPUT_CHARS));
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.error.message, /input/i);
});

test("deep nesting, macro tricks and odd characters give readable errors", () => {
  for (const code of [
    H + "int main() { int x = " + "(".repeat(20000) + "1" + ")".repeat(20000) + "; return 0; }",
    H + "int main() { " + "{".repeat(20000) + "}".repeat(20000) + " return 0; }",
  ]) {
    const r = timed(code);
    assert.equal(r.ok, false);
    if (!r.ok) { assert.notEqual(r.error.kind, "internal"); assert.match(r.error.message, /nests too deeply/); }
  }
  const self = timed("#define A A\n" + H + "int main() { int A = 1; return 0; }");
  assert.ok(self.ok || self.error.kind !== "internal");
  rejected(H + "int main() {\nint x = 1;\u0000\nreturn 0; }", /unexpected character/);
});
