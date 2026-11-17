// Structural sharing: a step reuses the cells that did not change.
import { test } from "node:test";
import assert from "node:assert/strict";
import { NODE, trace } from "./helpers";

const CODE = `${NODE}
int main() {
Node* a = new Node(1);
Node* b = new Node(2);
int x = 0;
x = 5;
b->data = 9;
x = 6;
return 0; }`;

test("an untouched heap object is the very same object in consecutive steps", () => {
  const t = trace(CODE);
  const at = (line: number) => t.steps.find((s) => s.sourceLine === line && s.kind === "statement")!;
  // `x = 6` (line 8) touches no heap object: the whole heap array is reused.
  assert.equal(at(8).heap, t.steps[t.steps.indexOf(at(8)) + 1].heap);
  // Node a is never written after its creation settles.
  assert.equal(at(6).heap[0], at(8).heap[0]);
});

test("changed is set on the step of the change and cleared on the next one", () => {
  const t = trace(CODE);
  const i = t.steps.findIndex((s) => s.sourceLine === 7);
  const data = (step: number) => t.steps[step].heap[1].children![0];
  assert.equal(data(i).value, "9");
  assert.equal(data(i).changed, true);
  assert.equal(data(i + 1).changed, undefined);
  assert.equal(t.steps[i].heap[0].changed, undefined, "the other node is not flagged");
});

test("stack variables are flagged when they change", () => {
  const t = trace(CODE);
  const step = t.steps.find((s) => s.sourceLine === 6)!;
  assert.equal(step.stack[0].variables.find((v) => v.name === "x")!.changed, true);
  assert.equal(step.stack[0].variables.find((v) => v.name === "a")!.changed, undefined);
});

test("ids are unique within every step", () => {
  const t = trace(`${NODE}
int depth(Node* n) { if (n == nullptr) return 0; return 1 + depth(n->next); }
int main() { Node* h = new Node(1); h->next = new Node(2); int d = depth(h); return 0; }`);
  for (const step of t.steps) {
    const ids: string[] = [];
    const walk = (m: { id: string; children?: { id: string }[] }) => { ids.push(m.id); (m.children as typeof m[] | undefined)?.forEach(walk); };
    step.stack.forEach((f) => f.variables.forEach(walk));
    step.heap.forEach(walk);
    assert.equal(new Set(ids).size, ids.length);
  }
});

test("a reference parameter shows the new value on the same step as the variable it stands for", () => {
  // Found while checking Gate 7: the callee's copy of `head` used to update one step late.
  const t = trace(`struct Node { int data; Node* next; };
void pop(Node*& head) {
Node* temp = head;
head = head->next;
int after = 1;
}
int main() { Node* head = new Node(); head->next = new Node(); head->next->next = NULL; pop(head); return 0; }`);
  const step = t.steps.find((s) => s.sourceLine === 4 && s.activeFunction === "pop")!;
  const inMain = step.stack[0].variables.find((v) => v.name === "head")!;
  const inPop = step.stack[1].variables.find((v) => v.name === "head")!;
  assert.equal(inMain.pointsTo, "h2");
  assert.equal(inPop.pointsTo, "h2");
  assert.equal(inPop.changed, true);
});
