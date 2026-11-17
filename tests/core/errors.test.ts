// Tasks 2.6 (runtime errors become steps), 2.7 (honest limits), 2.8 (readable errors).
import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_LIMITS } from "../../src/core/types";
import { field, last, NODE, rejected, trace, variable } from "./helpers";

function crash(body: string) {
  const t = trace(`${NODE}\nint main() {\n${body}\nreturn 0; }`);
  assert.equal(t.status, "error");
  assert.equal(last(t).kind, "error");
  assert.ok(t.notice, "an error trace carries a notice");
  return { t, step: last(t), error: last(t).error! };
}

test("2.6 null dereference: earlier steps are kept and the trace ends on an error step", () => {
  const { t, step, error } = crash(`Node* a = new Node(1);\nNode* p = a->next;\ncout << p->data;`);
  assert.equal(error.code, "null_dereference");
  assert.match(error.message, /p is nullptr/);
  assert.equal(step.sourceLine, 5);
  assert.ok(t.steps.length >= 4, "the steps before the crash are still there");
  assert.equal(step.heap.length, 1, "memory at the moment of the crash is shown");
});

test("2.6 use after delete", () => {
  const { error, step } = crash(`Node* a = new Node(1);\ndelete a;\ncout << a->data;`);
  assert.equal(error.code, "use_after_free");
  assert.match(error.message, /already deleted on line 4/);
  assert.equal(step.sourceLine, 5);
});

test("2.6 double delete", () => {
  const { error } = crash(`Node* a = new Node(1);\nNode* b = a;\ndelete a;\ndelete b;`);
  assert.equal(error.code, "double_free");
});

test("2.6 following a pointer that was never given a value", () => {
  const { error } = crash(`Node* p;\np->data = 3;`);
  assert.equal(error.code, "uninitialised_pointer");
});

test("2.6 forgotten next = nullptr is caught when the list is walked", () => {
  const t = trace(`struct Node { int data; Node* next; };
int main() {
  Node* head = new Node;
  head->data = 1;
  Node* t = head;
  while (t != NULL) { cout << t->data; t = t->next; }
  return 0; }`);
  assert.equal(t.status, "error");
  assert.equal(last(t).error?.code, "uninitialised_read");
  assert.equal(t.output, "1");
});

test("2.6 using a number before it has a value", () => {
  const { error } = crash(`int total;\ntotal += 5;`);
  assert.equal(error.code, "uninitialised_read");
});

test("2.6 array index out of bounds and division by zero", () => {
  assert.equal(crash(`int a[3];\na[3] = 1;`).error.code, "out_of_bounds");
  assert.equal(crash(`int z = 0;\nint q = 5 / z;`).error.code, "division_by_zero");
});

test("2.6 delete of something that did not come from new", () => {
  assert.equal(crash(`int x = 1;\nint* p = &x;\ndelete p;`).error.code, "invalid_free");
});

test("a pointer to deleted memory is marked dangling, not drawn as a live arrow", () => {
  const t = trace(`${NODE}\nint main() {\nNode* a = new Node(1);\nNode* b = a;\ndelete a;\nreturn 0; }`);
  const after = t.steps.find((s) => s.sourceLine === 5)!;
  const b = variable(after, "b");
  assert.equal(b.dangling, true);
  assert.equal(b.pointsTo, undefined);
  assert.equal(b.freedTarget, "h1");
});

test("a field pointing at a deleted node becomes dangling too", () => {
  const t = trace(`${NODE}\nint main() {\nNode* a = new Node(1);\na->next = new Node(2);\ndelete a->next;\nreturn 0; }`);
  const after = t.steps.find((s) => s.sourceLine === 5)!;
  assert.equal(field(after.heap[0], "next").dangling, true);
});

test("returning the address of a local variable leaves a dangling pointer", () => {
  const t = trace(`int* bad() { int x = 5; return &x; }\nint main() {\nint* p = bad();\ncout << *p;\nreturn 0; }`);
  assert.equal(t.status, "error");
  assert.equal(last(t).error?.code, "use_after_free");
});

test("2.7 an infinite loop is cut with a notice and its first steps are kept", () => {
  const t = trace(`int main() {\nint i = 0;\nwhile (i >= 0) { i++; }\nreturn 0; }`);
  assert.equal(t.status, "truncated");
  assert.match(t.notice!, /loop on line 3 ran more than 500 times/);
  assert.ok(t.steps.length > 100);
});

test("2.7 the step cap truncates instead of failing", () => {
  const t = trace(`int main() { int s = 0; for (int i = 0; i < 100; i++) { s += i; } return 0; }`, { ...DEFAULT_LIMITS, maxSteps: 50 });
  assert.equal(t.status, "truncated");
  assert.equal(t.steps.length, 50);
  assert.match(t.notice!, /limit of 50 steps/);
});

test("2.7 runaway recursion is cut with a hint about the base case", () => {
  const t = trace(`int down(int n) { return down(n - 1); }\nint main() { down(3); return 0; }`);
  assert.equal(t.status, "truncated");
  assert.match(t.notice!, /base case/);
});

test("2.8 parse errors name the token and the line, never a token number", () => {
  const samples = [
    `int main() { int x = ; return 0; }`,
    `int main() {\n int x = 5\n return 0; }`,
    `struct Node { int data Node* next; };`,
    `int main() { if x > 3 { } }`,
    `int main() { foo(; }`,
    `int main() { int a[]; }`,
  ];
  for (const code of samples) {
    const e = rejected(code);
    assert.match(e.message, /^Line \d+: /, code);
    assert.doesNotMatch(e.message, /Expected \d+|got \d+|\bTT\b|undefined/, code);
    assert.ok(e.line && e.line > 0);
  }
});

test("2.8 a missing semicolon is reported on the line that lacks it", () => {
  const e = rejected(`int main() {\n int x = 5\n return 0; }`);
  assert.equal(e.line, 2);
  assert.match(e.message, /missing a ";"/);
});

test("2.8 unsupported C++ says so, with a hint", () => {
  const cases: [string, RegExp][] = [
    [`int main() { int x; scanf("%d", &x); }`, /scanf\(\) is not supported yet.*cin/],
    [`template <class T> struct Node { T data; };`, /template is not supported yet/],
    [`#include <vector>\nint main() { vector<int> v; }`, /"vector<\.\.\.>" .* is not supported yet/],
    [`class A {}; class B : public A {};`, /Inheritance is not supported yet/],
    [`int main() { int x = (int) 3.5; }`, /type cast is not supported yet/],
    [`struct P { int x; }; int main() { P p; P* q = &p; q++; }`, /pointer arithmetic/],
  ];
  for (const [code, pattern] of cases) {
    const e = rejected(code);
    assert.match(e.message, pattern, code);
  }
});

test("2.8 undeclared names and wrong calls are rejected like a compiler would", () => {
  assert.match(rejected(`int main() { x = 5; }`).message, /"x" is not declared/);
  assert.match(rejected(`int main() { go(); }`).message, /"go" is not a function/);
  assert.match(rejected(`${NODE}\nint main() { Node* n = new Node(); }`).message, /no constructor that takes 0 arguments/);
  assert.match(rejected(`${NODE}\nint main() { Node* n = new Node(1); int x = n; }`).message, /cannot hold a pointer/);
});

test("an empty program is reported as empty", () => {
  assert.equal(rejected(`// nothing here`).kind, "empty");
});
