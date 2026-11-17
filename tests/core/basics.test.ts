// Basic regression tests of the interpreter.
import { test } from "node:test";
import assert from "node:assert/strict";
import type { MemoryItem } from "../../src/core/types";
import { lastLive, trace } from "./helpers";

const NODE = `struct Node { int data; Node* next; Node(int d) : data(d), next(nullptr) {} };`;

/** The heap when main reaches its end, before its variables are destroyed. */
const lastHeap = (code: string) => lastLive(trace(code)).heap;

test("includes and `using namespace std;` are ignored", () => {
  trace(`#include <iostream>\nusing namespace std;\n${NODE}\nint main(){ Node* h = new Node(1); return 0; }`);
});

test("NULL is treated as nullptr", () => {
  trace(`${NODE}\nint main(){ Node* h = new Node(1); h->next = NULL; return 0; }`);
});

test("typedef struct with alias", () => {
  trace(`typedef struct Node { int data; struct Node* next; } Node;
int main() { Node* h = NULL; h = new Node; h->data = 5; h->next = NULL; return 0; }`);
});

test("singly list built by insertEnd keeps 3 distinct nodes", () => {
  const heap = lastHeap(`${NODE}
void insertEnd(Node*& head, int v) {
  Node* n = new Node(v);
  if (head == nullptr) { head = n; return; }
  Node* t = head; while (t->next != nullptr) t = t->next; t->next = n;
}
int main() { Node* head = nullptr; insertEnd(head, 10); insertEnd(head, 20); insertEnd(head, 30); return 0; }`);
  assert.equal(heap.length, 3);
});

test("circular list: last node points back to first", () => {
  const heap = lastHeap(`${NODE}
int main() { Node* a = new Node(1); Node* b = new Node(2); Node* c = new Node(3);
  a->next = b; b->next = c; c->next = a; return 0; }`);
  const next = (h: MemoryItem) => h.children?.find((c) => c.label.includes("next"))?.pointsTo;
  assert.equal(next(heap[2]), heap[0].id);
});

test("delete frees the block; unreferenced allocation is flagged orphaned", () => {
  const heap = lastHeap(`${NODE}
int main() { Node* a = new Node(1); Node* b = new Node(2); a->next = b; delete b; a->next = nullptr;
  Node* c = new Node(9); c = nullptr; return 0; }`);
  assert.equal(heap.length, 2);
  assert.equal(heap.filter((h) => h.orphaned).length, 1);
});

test("null dereference is reported, not crashed", () => {
  // A crash keeps the trace and ends it on an error step.
  const t = trace(`struct Node { int data; Node* next; };\nint main(){ Node* p = nullptr; p->data = 1; return 0; }`);
  assert.equal(t.status, "error");
  const last = t.steps.at(-1)!;
  assert.equal(last.kind, "error");
  assert.equal(last.error?.code, "null_dereference");
  assert.equal(last.sourceLine, 2);
});

test("constructor body assignments are executed (not silently skipped)", () => {
  const heap = lastHeap(`struct Node { int data; Node* next; Node(int d){ data = d + 100; next = nullptr; } };
int main(){ Node* n = new Node(7); return 0; }`);
  const data = heap[0].children!.find((c) => c.label.includes("data"))!;
  assert.equal(data.value, "107");
});

test("this->field assignment in constructor body", () => {
  const heap = lastHeap(`struct Node { int data; Node* next; Node(int d){ this->data = d; this->next = nullptr; } };
int main(){ Node* n = new Node(4); return 0; }`);
  assert.equal(heap[0].children!.find((c) => c.label.includes("data"))!.value, "4");
});

test("any statement works inside a constructor body", () => {
  const heap = lastHeap(`struct Node { int data; Node(int d){ if (d > 0) { data = d; } else { data = 0; } } };
int main(){ Node* n = new Node(4); return 0; }`);
  assert.equal(heap[0].children![0].value, "4");
});
