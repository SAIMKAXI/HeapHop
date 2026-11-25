// Tasks 5.2 and 5.4 (layout side) and the viewport math of 5.5 / 5.6.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { detectLists, planLists } from "../../src/core/structures";
import { centerOn, fitView, layoutStep, readableZoomFor, screenToWorld, visibleWorldRect, zoomAt, intersects, MAX_ZOOM, MIN_ZOOM, PHONE_READABLE_ZOOM, READABLE_ZOOM, TREE_NODE_D, GAP_X, NODE_W, type Layout, type NodeBox } from "../../src/layout";
import type { Trace } from "../../src/core/types";
import { NODE, trace } from "../core/helpers";

const fixture = (name: string) => readFileSync(join(__dirname, "..", "fixtures", name), "utf8");

function layouts(t: Trace): Layout[] {
  const plan = planLists(t);
  return t.steps.map((s, i) => layoutStep(s, i, plan, detectLists(s)));
}
const liveIndex = (t: Trace) => t.steps.length - 2; // the step before "end"
const node = (l: Layout, id: string): NodeBox => l.nodes.find((n) => n.id === id)!;
const onEdge = (p: { x: number; y: number }, b: NodeBox) =>
  (p.x === b.x || p.x === b.x + b.width) ? p.y >= b.y && p.y <= b.y + b.height
  : (p.y === b.y || p.y === b.y + b.height) ? p.x >= b.x && p.x <= b.x + b.width : false;

test("5.2 the same input always gives the same layout", () => {
  const t = trace(fixture("10_singly_class_full.cpp"));
  const plan = planLists(t);
  t.steps.forEach((s, i) => {
    assert.deepEqual(layoutStep(s, i, plan, detectLists(s)), layoutStep(s, i, plan, detectLists(s)));
  });
});

for (const [file, count] of [["03_singly_struct_insert_end.cpp", 4], ["12_doubly_class.cpp", 4], ["13_circular_struct.cpp", 4]] as const) {
  test(`5.2 ${file} is drawn as one horizontal row in list order`, () => {
    const t = trace(fixture(file));
    const all = layouts(t);
    const busiest = all.reduce((a, b) => (b.nodes.length >= a.nodes.length ? b : a));
    assert.equal(busiest.nodes.length, count);
    const row = [...busiest.nodes].sort((a, b) => a.x - b.x);
    assert.equal(new Set(row.map((n) => n.y)).size, 1, "all nodes share one y");
    row.forEach((n, i) => assert.equal(n.x, i * (NODE_W + GAP_X)));
  });
}

test("5.2 every arrow starts on its source box and ends on its target box, at every step", () => {
  for (const file of ["08_singly_struct_reverse.cpp", "12_doubly_class.cpp", "14_circular_class.cpp", "10_singly_class_full.cpp"]) {
    const t = trace(fixture(file));
    for (const l of layouts(t)) {
      for (const a of l.arrows) {
        assert.ok(onEdge(a.start, node(l, a.from)), `${file}: arrow ${a.id} leaves its box`);
        if (a.from !== a.to) assert.ok(onEdge(a.end, node(l, a.to)), `${file}: arrow ${a.id} reaches its target`);
      }
    }
  }
});

test("5.2 positions are stable: reversing a list never moves a node", () => {
  const t = trace(fixture("08_singly_struct_reverse.cpp"));
  const all = layouts(t);
  // Every step inside reverse(): the list is fully built and is being rewired.
  const full = all.filter((_, i) => t.steps[i].activeFunction === "reverse");
  assert.ok(full.length > 15);
  for (const id of ["h1", "h2", "h3", "h4"]) {
    assert.equal(new Set(full.map((l) => `${node(l, id).x},${node(l, id).y}`)).size, 1, `${id} moved`);
    assert.equal(new Set(all.filter((l) => l.nodes.some((n) => n.id === id)).map((l) => node(l, id).x)).size, 1, `${id} never moves sideways`);
  }
  // before: arrows point right; after: they point left
  const first = full[0].arrows.filter((a) => a.kind === "next");
  const last = full[full.length - 1].arrows.filter((a) => a.kind === "next");
  assert.ok(first.every((a) => a.end.x > a.start.x));
  assert.ok(last.every((a) => a.end.x < a.start.x));
});

test("5.4 a new node waits below its slot until it is linked in", () => {
  const t = trace(`${NODE}\nint main() {\nNode* head = new Node(1);\nNode* n = new Node(2);\nn->next = head;\nhead = n;\nreturn 0; }`);
  const all = layouts(t);
  const at = (line: number) => all[t.steps.findIndex((s) => s.sourceLine === line && s.kind === "statement")];
  assert.equal(node(at(4), "h2").level, 1);
  assert.equal(node(at(5), "h2").level, 0);
  assert.ok(node(at(5), "h2").x < node(at(5), "h1").x, "the new head sits to the left of the old one");
  assert.equal(node(at(4), "h2").x, node(at(5), "h2").x, "it only moves up, not sideways");
});

test("5.4 after head = head->next the old first node is detached", () => {
  const t = trace(`${NODE}\nint main() {\nNode* head = new Node(1);\nhead->next = new Node(2);\nhead = head->next;\nreturn 0; }`);
  const all = layouts(t);
  const i = t.steps.findIndex((s) => s.sourceLine === 5);
  assert.equal(node(all[i - 1], "h1").level, 0);
  assert.equal(node(all[i], "h1").level, 1);
  assert.equal(node(all[i], "h2").level, 0);
});

test("5.4 chips: head and an alias sit on the node they point at; the last node gets a NULL box", () => {
  const t = trace(`${NODE}\nint main() {\nNode* head = new Node(1);\nhead->next = new Node(2);\nNode* cur = head;\nNode* tail = head->next;\nreturn 0; }`);
  const l = layouts(t)[liveIndex(t)];
  const on = (id: string) => l.chips.filter((c) => c.nodeId === id).map((c) => c.label).sort();
  assert.deepEqual(on("h1"), ["cur", "head"]);
  assert.deepEqual(on("h2"), ["tail"]);
  const h1 = node(l, "h1");
  for (const c of l.chips.filter((x) => x.nodeId === "h1")) assert.ok(c.y + c.height <= h1.y, "chips sit above the node");
  assert.deepEqual(l.terminals.map((x) => `${x.nodeId}:${x.label}`), ["h2:NULL"]);
  assert.ok(l.terminals[0].x >= node(l, "h2").x + NODE_W, "NULL is drawn to the right of the last node");
});

test("5.4 pointers held inside a stack object become chips named object.field", () => {
  const t = trace(fixture("12_doubly_class.cpp"));
  const l = layouts(t).reduce((a, b) => (b.nodes.length >= a.nodes.length ? b : a));
  const labels = l.chips.map((c) => c.label);
  assert.ok(labels.includes("dll.head") && labels.includes("dll.tail"), labels.join(","));
});

test("5.4 uninitialised and dangling links get their own end markers", () => {
  const t = trace(`struct Node { int data; Node* next; };\nint main() {\nNode* a = new Node;\nNode* b = new Node();\na->next = b;\ndelete b;\nreturn 0; }`);
  const all = layouts(t);
  const at = (line: number) => all[t.steps.findIndex((s) => s.sourceLine === line && s.kind === "statement")];
  assert.deepEqual(at(3).terminals.map((x) => x.label), ["?"]);
  assert.deepEqual(at(6).terminals.map((x) => x.label), ["deleted"]);
});

test("5.4 an end marker never sits on the lane of a straight arrow", () => {
  const t = trace(fixture("08_singly_struct_reverse.cpp"));
  for (const l of layouts(t)) {
    for (const term of l.terminals) {
      const y = term.y + term.height / 2;
      const hit = l.arrows.find((a) => a.start.y === a.end.y && Math.abs(a.start.y - y) < term.height &&
        Math.min(a.start.x, a.end.x) < term.x + term.width && Math.max(a.start.x, a.end.x) > term.x);
      assert.equal(hit, undefined, `terminal of ${term.nodeId} overlaps arrow ${hit?.id}`);
    }
  }
});

test("5.10 a binary search tree: parents above children, and left-to-right order is sorted order", () => {
  const t = trace(`struct T { int key; T* left; T* right; };
T* insert(T* root, int key) {
  if (root == nullptr) { T* n = new T(); n->key = key; return n; }
  if (key < root->key) root->left = insert(root->left, key);
  else root->right = insert(root->right, key);
  return root;
}
int main() { T* root = nullptr; root = insert(root, 50); root = insert(root, 30); root = insert(root, 70); root = insert(root, 20); root = insert(root, 40); root = insert(root, 60); return 0; }`);
  const i = liveIndex(t);
  const l = layouts(t)[i];
  const key = (id: string) => Number(t.steps[i].heap.find((h) => h.id === id)!.children![0].value);
  const byX = [...l.nodes].sort((a, b) => a.x - b.x).map((n) => key(n.id));
  assert.deepEqual(byX, [20, 30, 40, 50, 60, 70]);
  const y = (k: number) => l.nodes.find((n) => key(n.id) === k)!.y;
  assert.ok(y(50) < y(30) && y(30) === y(70) && y(30) < y(20) && y(20) === y(40) && y(40) === y(60));
  for (const n of l.nodes) assert.ok(n.width === TREE_NODE_D && n.height === TREE_NODE_D, "tree nodes are circles of one size");
  const centre = (n: NodeBox) => ({ x: n.x + n.width / 2, y: n.y + n.height / 2 });
  for (const a of l.arrows) {
    const from = node(l, a.from), to = node(l, a.to);
    assert.equal(a.kind, "branch");
    assert.ok(Math.abs(Math.hypot(a.start.x - centre(from).x, a.start.y - centre(from).y) - TREE_NODE_D / 2) < 0.5, "a branch leaves the parent's circle");
    assert.deepEqual(a.end, { x: centre(to).x, y: to.y }, "and arrives at the top of the child");
    assert.ok(a.end.y > a.start.y, "branches go down");
  }
  assert.equal(l.terminals.length, 0, "trees do not get NULL boxes on every leaf");
});

test("5.10 REAL LAB 9: every step of the AVL programs lays out without overlap", () => {
  for (const file of ["21_lab9_avl_insert.cpp", "23_lab9_avl_delete.cpp"]) {
    const t = trace(fixture(file));
    for (const l of layouts(t)) {
      for (let a = 0; a < l.nodes.length; a++) for (let b = a + 1; b < l.nodes.length; b++) {
        const p = l.nodes[a], q = l.nodes[b];
        const apart = p.x + p.width <= q.x || q.x + q.width <= p.x || p.y + p.height <= q.y || q.y + q.height <= p.y;
        assert.ok(apart, `${file}: ${p.id} overlaps ${q.id}`);
      }
    }
  }
});

test("5.2 objects that are not list nodes go to the grid; an array made with new[] is drawn as cells", () => {
  const t = trace(`int main() { int* a = new int[3]; int* p = new int(5); int* q = new int(6); a[0] = 1; return 0; }`);
  const l = layouts(t)[liveIndex(t)];
  assert.deepEqual(l.nodes.map((n) => n.family), [-1, -1]);
  assert.equal(l.nodes[0].y, l.nodes[1].y);
  assert.deepEqual(l.arrays.map((a) => [a.id, a.cells.length]), [["h1", 3]]);
  assert.ok(l.arrays[0].y + l.arrays[0].height < l.nodes[0].y, "arrays sit above the other objects");
});

test("5.2 bounds contain everything", () => {
  const t = trace(fixture("14_circular_class.cpp"));
  for (const l of layouts(t)) {
    const b = l.bounds;
    for (const r of [...l.arrays, ...l.nodes, ...l.chips, ...l.terminals]) {
      assert.ok(r.x >= b.x && r.y >= b.y && r.x + r.width <= b.x + b.width && r.y + r.height <= b.y + b.height);
    }
  }
});

test("5.5 zooming keeps the point under the cursor where it is", () => {
  let view = { x: 37, y: -12, k: 0.8 };
  const cursor = { x: 420, y: 260 };
  const before = screenToWorld(view, cursor);
  for (const factor of [1.2, 1.2, 0.5, 1.7, 0.9]) {
    view = zoomAt(view, cursor, factor);
    const after = screenToWorld(view, cursor);
    assert.ok(Math.abs(after.x - before.x) < 1e-9 && Math.abs(after.y - before.y) < 1e-9);
  }
  assert.equal(zoomAt(view, cursor, 1000).k, MAX_ZOOM);
  assert.equal(zoomAt(view, cursor, 0.0001).k, MIN_ZOOM);
});

test("automatic framing keeps text readable and shows the head end of a long list", () => {
  const size = { width: 420, height: 600 };
  const bounds = { x: 0, y: 0, width: 2000, height: 200 };
  const view = fitView(bounds, size, READABLE_ZOOM);
  assert.equal(view.k, READABLE_ZOOM);
  assert.equal(screenToWorld(view, { x: 48, y: 0 }).x, 0, "the left end of the picture sits at the padding");
  const small = { x: 10, y: 10, width: 300, height: 100 };
  assert.deepEqual(fitView(small, size, READABLE_ZOOM), fitView(small, size), "a picture that fits is centred the same way");
});

test("5.6 fit shows everything and focus centres a node", () => {
  const size = { width: 900, height: 500 };
  const bounds = { x: -40, y: -100, width: 6000, height: 400 };
  const view = fitView(bounds, size);
  const seen = visibleWorldRect(view, size);
  assert.ok(seen.x <= bounds.x && seen.y <= bounds.y && seen.x + seen.width >= bounds.x + bounds.width && seen.y + seen.height >= bounds.y + bounds.height);
  assert.ok(fitView({ x: 0, y: 0, width: 100, height: 50 }, size).k <= 1, "a small picture is not blown up");
  const box = { x: 3000, y: 120, width: 148, height: 82 };
  const focused = centerOn(box, size, 1);
  const centre = screenToWorld(focused, { x: 450, y: 250 });
  assert.deepEqual(centre, { x: box.x + box.width / 2, y: box.y + box.height / 2 });
});

test("5.7 only boxes inside the visible rectangle need drawing", () => {
  const size = { width: 800, height: 400 };
  const seen = visibleWorldRect({ x: -2000, y: 0, k: 1 }, size, 100);
  assert.equal(intersects(seen, { x: 0, y: 0, width: 148, height: 80 }), false);
  assert.equal(intersects(seen, { x: 2100, y: 50, width: 148, height: 80 }), true);
});

test("on a phone-width canvas the camera stops zooming out sooner, so node text stays readable", () => {
  assert.equal(readableZoomFor(1200), READABLE_ZOOM, "wide canvases keep the usual limit");
  assert.equal(readableZoomFor(560), READABLE_ZOOM);
  assert.equal(readableZoomFor(390), PHONE_READABLE_ZOOM);
  assert.ok(PHONE_READABLE_ZOOM > READABLE_ZOOM);
  const longList = { x: 0, y: 0, width: 1400, height: 120 };
  const view = fitView(longList, { width: 390, height: 500 }, readableZoomFor(390));
  assert.equal(view.k, PHONE_READABLE_ZOOM);
  assert.equal(view.x, 48, "too wide for the screen: the head of the list is shown, the rest is a swipe away");
});
