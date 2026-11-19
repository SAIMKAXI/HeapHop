// Chain detection and the stable order.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { detectLists, planLists } from "../../src/core/structures";
import { lastLive, NODE, trace } from "./helpers";

const fixtures = join(__dirname, "..", "fixtures");
const finalLists = (code: string) => detectLists(lastLive(trace(code))).lists;

test("three linked nodes are one singly linked list in order", () => {
  const lists = finalLists(`${NODE}\nint main() { Node* h = new Node(1); h->next = new Node(2); h->next->next = new Node(3); return 0; }`);
  assert.equal(lists.length, 1);
  assert.equal(lists[0].kind, "singly");
  assert.deepEqual(lists[0].nodes, ["h1", "h2", "h3"]);
  assert.equal(lists[0].shape.next, "next");
});

test("every list fixture is classified by the kind in its label", () => {
  for (const file of readdirSync(fixtures).filter((f) => f.endsWith(".cpp"))) {
    const code = readFileSync(join(fixtures, file), "utf8");
    const label = /^\/\/ label: (\w+)/.exec(code)![1]; // singly | doubly | circular | tree | array
    if (label === "tree" || label === "array") continue; // checked in their own tests
    if (/\bcin\b/.test(code)) continue; // needs program input; covered by the fixture test
    const t = trace(code);
    // Use the step with the most nodes: destructors may empty the list before the end.
    const busiest = t.steps.reduce((a, b) => (b.heap.length >= a.heap.length ? b : a));
    const kinds = new Set(t.steps.filter((s) => s.heap === busiest.heap).flatMap((s) => detectLists(s).lists.map((l) => l.kind)));
    const all = new Set(t.steps.flatMap((s) => detectLists(s).lists.map((l) => l.kind)));
    assert.equal(detectLists(busiest).unknownTypes.length, 0, file);
    if (label === "circular") assert.ok([...all].some((k) => k.startsWith("circular")), `${file}: ${[...all]}`);
    else if (label === "doubly") assert.ok(kinds.has("doubly"), `${file}: ${[...kinds]}`);
    else assert.ok(kinds.has("singly") && !all.has("doubly") && ![...all].some((k) => k.startsWith("circular")), `${file}: ${[...all]}`);
  }
});

test("a circular list is recognised and keeps its order from the head", () => {
  const lists = finalLists(`${NODE}\nint main() { Node* a = new Node(1); Node* b = new Node(2); Node* c = new Node(3); a->next = b; b->next = c; c->next = a; return 0; }`);
  assert.equal(lists[0].kind, "circular singly");
  assert.deepEqual(lists[0].nodes, ["h1", "h2", "h3"]);
});

test("the manual head override chooses where a circular list starts", () => {
  const t = trace(`${NODE}\nint main() { Node* a = new Node(1); Node* b = new Node(2); Node* c = new Node(3); a->next = b; b->next = c; c->next = a; Node* tail = c; return 0; }`);
  const lists = detectLists(lastLive(t), { headCellId: "f0_tail" }).lists;
  assert.deepEqual(lists[0].nodes, ["h3", "h1", "h2"]);
});

test("doubly linked: fields named prev/next, any declaration order", () => {
  const lists = finalLists(`struct D { D* prev; int v; D* next; };
int main() { D* a = new D(); D* b = new D(); a->next = b; b->prev = a; return 0; }`);
  assert.equal(lists[0].kind, "doubly");
  assert.deepEqual(lists[0].shape, { typeName: "D", next: "next", prev: "prev" });
  assert.deepEqual(lists[0].nodes, ["h1", "h2"]);
});

test("doubly linked with unusual field names is recognised by its mirrored links", () => {
  const lists = finalLists(`struct D { int v; D* p1; D* p2; };
int main() { D* a = new D(); D* b = new D(); a->p1 = b; b->p2 = a; return 0; }`);
  assert.equal(lists[0].kind, "doubly");
});

test("two self-pointers that do not mirror each other are a binary tree, not a list", () => {
  const s = detectLists(lastLive(trace(`struct T { int v; T* left; T* right; };
int main() { T* r = new T(); r->left = new T(); r->right = new T(); r->left->left = new T(); return 0; }`)));
  assert.equal(s.lists.length, 0);
  assert.equal(s.unknownTypes.length, 0);
  assert.equal(s.trees.length, 1);
  assert.equal(s.trees[0].root, "h1");
  assert.deepEqual(s.trees[0].nodes, ["h1", "h2", "h4", "h3"]);
  assert.deepEqual(s.trees[0].children.get("h1"), { left: "h2", right: "h3" });
});

test("three or more unrelated self-pointers stay unknown", () => {
  const s = detectLists(lastLive(trace(`struct Q { Q* a; Q* b; Q* c; };
int main() { Q* r = new Q(); r->a = new Q(); return 0; }`)));
  assert.deepEqual(s.unknownTypes, ["Q"]);
  assert.equal(s.trees.length, 0);
});

test("REAL LAB 9: the AVL tree is one binary tree with the rebalanced root", () => {
  const t = trace(readFileSync(join(fixtures, "21_lab9_avl_insert.cpp"), "utf8"));
  const busiest = t.steps.reduce((a, b) => (b.heap.length >= a.heap.length ? b : a));
  const s = detectLists(busiest);
  assert.equal(s.lists.length, 0);
  assert.equal(s.trees.length, 1);
  assert.equal(s.trees[0].nodes.length, 6); // inserts 10 20 30 40 50 25
});

test("two separate lists are two lists", () => {
  const lists = finalLists(`${NODE}\nint main() { Node* a = new Node(1); a->next = new Node(2); Node* b = new Node(7); b->next = new Node(8); return 0; }`);
  assert.deepEqual(lists.map((l) => l.nodes), [["h1", "h2"], ["h3", "h4"]]);
});

test("plan: reversing a list does not move its nodes", () => {
  const t = trace(readFileSync(join(fixtures, "08_singly_struct_reverse.cpp"), "utf8"));
  const plan = planLists(t);
  const order = [...plan.rank.entries()].sort((a, b) => a[1] - b[1]).map(([id]) => id);
  assert.deepEqual(order, ["h1", "h2", "h3", "h4"]);
  assert.equal(new Set(plan.family.values()).size, 1);
});

test("plan: a node inserted at the front is ranked before the old head, at the end after the tail, in the middle between", () => {
  const order = (code: string) => { const p = planLists(trace(code)); return [...p.rank.entries()].sort((a, b) => a[1] - b[1]).map(([id]) => id); };
  assert.deepEqual(order(readFileSync(join(fixtures, "02_singly_struct_insert_front.cpp"), "utf8")), ["h3", "h2", "h1"]);
  assert.deepEqual(order(readFileSync(join(fixtures, "03_singly_struct_insert_end.cpp"), "utf8")), ["h1", "h2", "h3", "h4"]);
  // fixture 04 inserts 10, 30, then 20 between them, then 5 at the front, then a rejected 99
  assert.deepEqual(order(readFileSync(join(fixtures, "04_singly_struct_insert_position.cpp"), "utf8")), ["h4", "h1", "h3", "h2", "h5"]);
});

test("plan: separate lists get separate families", () => {
  const plan = planLists(trace(`${NODE}\nint main() { Node* a = new Node(1); a->next = new Node(2); Node* b = new Node(7); b->next = new Node(8); return 0; }`));
  assert.equal(plan.familyCount, 2);
  assert.notEqual(plan.family.get("h1"), plan.family.get("h3"));
  assert.equal(plan.family.get("h1"), plan.family.get("h2"));
});

test("11.4 index names are read per array: a nested subscript indexes the inner array only", async () => {
  const { arrayIndexNames } = await import("../../src/core/structures");
  const m = arrayIndexNames(["table[keys[k] % 5] = n; // a[x] in a comment", "if (a[j] > a[j + 1]) swap(a[j], a[j + 1]);", "arr[++topIndex] = v;", "q.arr[q.rear] = 1; cout << \"b[i]\";"]);
  assert.deepEqual([...m.get("table")!], []);
  assert.deepEqual([...m.get("keys")!], ["k"]);
  assert.deepEqual([...m.get("a")!], ["j"]);
  assert.deepEqual([...m.get("arr")!].sort(), ["q", "rear", "topIndex"]);
  assert.equal(m.get("b"), undefined, "text inside a string is ignored");
});
