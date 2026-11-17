// cin reads from input supplied before the run.
import { test } from "node:test";
import assert from "node:assert/strict";
import { run } from "../../src/core/interpreter";
import { last } from "./helpers";

function withInput(code: string, input: string) {
  const r = run(code, undefined, input);
  if (!r.ok) assert.fail(r.error.message);
  return r.trace;
}

test("cin >> reads whitespace-separated values in order", () => {
  const t = withInput(`int main() { int a, b; cin >> a >> b; cout << a + b; return 0; }`, "  4\n 5 ");
  assert.equal(t.output, "9");
  const step = t.steps.find((s) => s.kind === "input")!;
  assert.equal(step.input, "4 5");
  assert.match(step.explanation, /←  4 5/);
});

test("cin reads int, double, char, string and bool by the type of the variable", () => {
  const t = withInput(`int main() { int i; double d; char c; string s; bool b; cin >> i >> d >> c >> s >> b; cout << i << " " << d << " " << c << " " << s << " " << b; return 0; }`, "7 2.5 x hello 1");
  assert.equal(t.output, "7 2.5 x hello 1");
});

test("cin can read straight into a field or an array element", () => {
  const t = withInput(`struct Node { int data; Node* next; };
int main() { Node* n = new Node(); int a[2]; cin >> n->data >> a[1]; cout << n->data + a[1]; return 0; }`, "3 4");
  assert.equal(t.output, "7");
});

test("getline reads the rest of the line; cin.ignore skips the newline left by >>", () => {
  const code = (ignore: string) => `int main() { int n; string name; cin >> n; ${ignore} getline(cin, name); cout << n << "[" << name << "]"; return 0; }`;
  assert.equal(withInput(code("cin.ignore();"), "5\nAli Raza\n").output, "5[Ali Raza]");
  // The classic mistake: without ignore, getline reads the empty rest of the first line.
  assert.equal(withInput(code(""), "5\nAli Raza\n").output, "5[]");
});

test("a menu loop driven by cin runs until its exit choice", () => {
  const t = withInput(`int main() { int choice; int total = 0; do { cin >> choice; if (choice > 0) total += choice; } while (choice != 0); cout << total; return 0; }`, "5 6 7 0");
  assert.equal(t.status, "completed");
  assert.equal(t.output, "18");
});

test("running out of input stops the trace with a notice that says what to do", () => {
  const t = withInput(`int main() {\nint a;\ncout << "Enter: ";\ncin >> a;\nreturn 0; }`, "");
  assert.equal(t.status, "truncated");
  assert.match(t.notice!, /Line 4 waits for input \(a\).*no more values.*Program input/);
  assert.equal(t.output, "Enter: ", "what was printed before the wait is kept");
  assert.equal(last(t).sourceLine, 3);
});

test("input that is not a number for an int is reported, not silently turned into 0", () => {
  const t = withInput(`int main() { int a; cin >> a; return 0; }`, "abc");
  assert.equal(t.status, "truncated");
  assert.match(t.notice!, /"abc", which is not a whole number/);
});

test("#define and const int can size an array member", () => {
  const t = withInput(`#define SIZE 3
const int CAP = 2;
class Box { public: int a[SIZE]; int b[CAP]; Box() { a[2] = 1; b[1] = 2; } };
int main() { Box x; cout << x.a[2] + x.b[1] << SIZE; return 0; }`, "");
  assert.equal(t.output, "33");
});
