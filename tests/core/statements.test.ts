// Statement and expression coverage.
import { test } from "node:test";
import assert from "node:assert/strict";
import { lastLive, trace, variable } from "./helpers";

const out = (body: string, pre = "") => trace(`${pre}\nint main() {\n${body}\nreturn 0; }`).output;

test("do-while runs the body before testing the condition", () => {
  assert.equal(out(`int i = 5; do { cout << i; i++; } while (i < 3);`), "5");
});

test("else if chain picks the first true branch", () => {
  assert.equal(out(`int x = 7; if (x < 5) cout << "a"; else if (x < 10) cout << "b"; else cout << "c";`), "b");
});

test("switch: matching case, fall-through, break and default", () => {
  const sw = (n: number) => out(`int x = ${n}; switch (x) { case 1: cout << "one"; case 2: cout << "two"; break; default: cout << "other"; }`);
  assert.equal(sw(1), "onetwo");
  assert.equal(sw(2), "two");
  assert.equal(sw(9), "other");
});

test("break leaves the loop, continue skips to the next round", () => {
  assert.equal(out(`for (int i = 0; i < 10; i++) { if (i == 2) continue; if (i == 5) break; cout << i; }`), "0134");
});

test("prefix and postfix ++ / --", () => {
  assert.equal(out(`int a = 5; int b = a++; int c = ++a; int d = a--; cout << a << b << c << d;`), "6577");
});

test("compound assignment operators", () => {
  assert.equal(out(`int a = 10; a += 5; a -= 3; a *= 2; a /= 5; a %= 3; cout << a;`), "1");
});

test("ternary and chained assignment", () => {
  assert.equal(out(`int a; int b; a = b = 4; int m = a > 3 ? 1 : 2; cout << a << b << m;`), "441");
});

test("integer division truncates, double division does not", () => {
  assert.equal(out(`int a = 7 / 2; double d = 7 / 2.0; cout << a << " " << d;`), "3 3.5");
});

test("char, string and bool values print as C++ prints them", () => {
  assert.equal(out(`char c = 'x'; string s = "hi"; bool ok = true; s = s + "!"; cout << c << s << ok << (1 == 2);`), "xhi!10");
});

test("string escapes and endl produce real newlines", () => {
  assert.equal(out(`cout << "a\\n" << "b" << endl << "c\\td";`), "a\nb\nc\td");
});

test("several declarators in one statement", () => {
  const t = trace(`struct Node { int data; Node* next; };
int main() { Node *a = NULL, *b = NULL; int x = 1, y = 2; cout << x + y; return 0; }`);
  assert.equal(t.output, "3");
  assert.equal(variable(lastLive(t), "b").kind, "pointer");
});

test("a variable declared inside a block disappears when the block ends", () => {
  const t = trace(`int main() {\nint a = 1;\nif (a == 1) {\nint inner = 2;\na = inner;\n}\nreturn 0; }`);
  const inside = t.steps.find((s) => s.sourceLine === 5)!;
  assert.ok(inside.stack[0].variables.some((v) => v.name === "inner"));
  assert.ok(!lastLive(t).stack[0].variables.some((v) => v.name === "inner"));
});

test("a for-loop variable lives only for the loop", () => {
  const t = trace(`int main() {\nfor (int i = 0; i < 2; i++) { }\nint after = 1;\nreturn 0; }`);
  assert.deepEqual(lastLive(t).stack[0].variables.map((v) => v.name), ["after"]);
});

test("stack array with an initialiser list, indexed in a loop", () => {
  assert.equal(out(`int a[4] = {3, 1, 4}; int s = 0; for (int i = 0; i < 4; i++) s += a[i]; cout << s;`), "8");
});

test("new[] and delete[]", () => {
  const t = trace(`int main() { int* a = new int[3]; a[0] = 1; a[1] = 2; a[2] = a[0] + a[1]; cout << a[2]; delete[] a; return 0; }`);
  assert.equal(t.output, "3");
  assert.equal(lastLive(t).heap.length, 0);
});

test("global variables and function prototypes", () => {
  const t = trace(`struct Node { int data; Node* next; };
Node* head = NULL;
void push(int v);
int main() { push(1); push(2); cout << head->data << head->next->data; return 0; }
void push(int v) { Node* n = new Node(); n->data = v; n->next = head; head = n; }`);
  assert.equal(t.output, "21");
  assert.equal(t.steps[1].stack[0].name, "globals");
});

test("address of a local variable and writing through the pointer", () => {
  assert.equal(out(`int x = 1; int* p = &x; *p = 9; cout << x;`), "9");
});

test("stack-allocated nodes linked with &", () => {
  const t = trace(`struct Node { int data; Node* next; };
int main() { Node a; Node b; a.data = 1; b.data = 2; a.next = &b; b.next = NULL; cout << a.next->data; return 0; }`);
  assert.equal(t.output, "2");
  const a = variable(lastLive(t), "a");
  assert.equal(a.children!.find((c) => c.name === "next")!.pointsTo, "f0_b");
});

test("objects are copied on assignment (value semantics)", () => {
  assert.equal(out(`P a; a.x = 1; P b = a; b.x = 5; cout << a.x << b.x;`, `struct P { int x; };`), "15");
});

test("snippet style: statements with no main() still run", () => {
  const t = trace(`struct Node { int data; Node* next; };\nNode* head = new Node;\nhead->data = 1;\nhead->next = nullptr;`);
  assert.equal(t.status, "completed");
  assert.equal(lastLive(t).heap.length, 1);
});
