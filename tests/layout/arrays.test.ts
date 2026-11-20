// Task 11.4: arrays drawn as a row of cells, with index markers and a heap view.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { detectLists, planLists } from "../../src/core/structures";
import { layoutStep, CELL_W, type Layout } from "../../src/layout";
import type { Trace } from "../../src/core/types";
import { NODE, trace } from "../core/helpers";

const fixture = (name: string) => readFileSync(join(__dirname, "..", "fixtures", name), "utf8");
function layouts(t: Trace): Layout[] {
  const plan = planLists(t);
  return t.steps.map((s, i) => layoutStep(s, i, plan, detectLists(s)));
}
const at = (t: Trace, ls: Layout[], pick: (i: number) => boolean) => ls[t.steps.findIndex((_, i) => pick(i))];
const H = "#include <iostream>\nusing namespace std;\n";

test("a local array is one row of touching cells, in index order, with its values", () => {
  const t = trace(`${H}int main() {\nint a[4] = {7, 3, 9, 1};\nreturn 0; }`);
  const l = layouts(t)[t.steps.length - 2];
  const [strip] = l.arrays;
  assert.equal(strip.title, "a");
  assert.equal(strip.owner, "main");
  assert.deepEqual(strip.cells.map((c) => c.text), ["7", "3", "9", "1"]);
  strip.cells.forEach((c, i) => { assert.equal(c.index, i); assert.equal(c.x, strip.cells[0].x + i * CELL_W); assert.equal(c.y, strip.cellsY); });
});

test("the same step always gives the same array layout", () => {
  const t = trace(fixture("25_lab7_circular_array_queue.cpp"));
  const plan = planLists(t);
  t.steps.forEach((s, i) => assert.deepEqual(layoutStep(s, i, plan, detectLists(s)).arrays, layoutStep(s, i, plan, detectLists(s)).arrays));
});

test("an array-based queue shows front above the cell it names and rear below, as lectures draw it", () => {
  const t = trace(fixture("25_lab7_circular_array_queue.cpp"));
  const ls = layouts(t);
  const l = ls.find((x) => x.arrays.some((a) => a.markers.some((m) => m.label === "front" && m.index >= 0) && a.markers.some((m) => m.label === "rear" && m.index >= 0)))!;
  const strip = l.arrays.find((a) => a.title.endsWith(".arr"))!;
  for (const m of strip.markers) {
    const cell = strip.cells.find((c) => c.index === m.index)!;
    assert.ok(m.x >= cell.x && m.x + m.width <= cell.x + cell.width, `${m.label} sits over cell ${m.index}`);
    if (m.label === "rear") assert.ok(m.y >= cell.y + cell.height, "rear is below the cells");
    else assert.ok(m.y + m.height <= strip.cellsY, `${m.label} is above the cells`);
  }
});

test("an array stack stands upright: index 0 at the bottom, top tagged beside its cell, the unused rest hidden", () => {
  const t = trace(`${H}class Stack {\npublic:\nint arr[1000];\nint topIndex = -1;\nvoid push(int v) { arr[++topIndex] = v; }\n};\nint main() {\nStack s;\ns.push(5);\ns.push(28);\nreturn 0; }`);
  const ls = layouts(t);
  assert.ok(ls.some((x) => x.arrays.some((a) => a.upright && a.markers.some((m) => m.label === "topIndex" && m.index === -1))), "empty stack: top is -1");
  const l = ls.find((x) => x.arrays.some((a) => a.upright && a.markers.some((m) => m.label === "topIndex" && m.index === 1)))!;
  const strip = l.arrays.find((a) => a.upright)!;
  const [c0, c1] = strip.cells;
  assert.equal(c0.x, c1.x, "one column");
  assert.ok(c1.y < c0.y, "cell 1 is above cell 0");
  const top = strip.markers.find((m) => m.label === "topIndex")!;
  assert.ok(top.x >= c1.x + c1.width && top.y >= c1.y && top.y + top.height <= c1.y + c1.height, "topIndex is beside cell 1");
  assert.equal(strip.length, 1000);
  assert.ok(strip.cells.length <= 16 && strip.hiddenAfter === 1000 - strip.cells.length);
});

test("a linked stack stands upright too: the node topNode points at is on top", () => {
  const t = trace(`${H}struct Node {\nint data;\nNode* next;\n};\nclass LinkedStack {\npublic:\nNode* topNode = nullptr;\nvoid push(int v) {\nNode* n = new Node();\nn->data = v;\nn->next = topNode;\ntopNode = n;\n}\n};\nint main() {\nLinkedStack s;\ns.push(1);\ns.push(2);\ns.push(3);\nreturn 0; }`);
  const l = layouts(t)[t.steps.length - 2];
  const [n3, n2, n1] = ["h3", "h2", "h1"].map((id) => l.nodes.find((n) => n.id === id)!);
  assert.ok(n3.x === n2.x && n2.x === n1.x, "one column");
  assert.ok(n3.y < n2.y && n2.y < n1.y, "newest on top");
});

test("inside a sorting function, the j it indexes with marks the caller's array; the pass counter i does not", () => {
  const t = trace(`${H}void bubble(int a[], int n) {\nfor (int i = 0; i < n - 1; i++)\nfor (int j = 0; j < n - i - 1; j++)\nif (a[j] > a[j + 1]) swap(a[j], a[j + 1]);\n}\nint main() {\nint values[4] = {4, 2, 3, 1};\nbubble(values, 4);\nreturn 0; }`);
  const ls = layouts(t);
  const l = at(t, ls, (i) => t.steps[i].kind === "condition" && t.steps[i].sourceLine === 6);
  const strip = l.arrays.find((a) => a.title === "values")!;
  const labels = strip.markers.map((m) => `${m.label}:${m.active}`).sort();
  assert.deepEqual(labels, ["j:true"]);
  assert.ok(strip.cells.some((c) => c.read), "the cells the comparison read are marked");
});

test("a pointer cell (a hash bucket) gets an arrow down to the node it points at", () => {
  const t = trace(`${H}${NODE}\nint main() {\nNode* table[3];\nfor (int i = 0; i < 3; i++) table[i] = nullptr;\ntable[1] = new Node(7);\nreturn 0; }`);
  const l = layouts(t)[t.steps.length - 2];
  const strip = l.arrays[0];
  const arrow = l.arrows.find((a) => a.from === strip.id)!;
  assert.equal(arrow.id, strip.cells[1].cellId);
  assert.equal(arrow.to, "h1");
  assert.deepEqual(strip.cells.map((c) => c.text), ["NULL", "", "NULL"]);
});

test("an array named like a heap is also drawn as a complete binary tree of its first `size` cells", () => {
  const t = trace(`${H}int main() {\nint heap[7] = {90, 70, 80, 30, 60};\nint size = 5;\nreturn 0; }`);
  const l = layouts(t)[t.steps.length - 2];
  const view = l.arrays[0].heap!;
  assert.equal(view.nodes.length, 5);
  assert.equal(view.edges.length, 4);
  assert.ok(view.nodes[1].y > view.nodes[0].y && view.nodes[3].y > view.nodes[1].y, "children are below their parent");
  assert.ok(view.nodes[1].x < view.nodes[0].x && view.nodes[2].x > view.nodes[0].x, "left child left, right child right");
  assert.ok(view.nodes.every((n) => n.y >= l.arrays[0].cellsY + 36), "the tree is below the cells");
});

test("a loop counter of one array does not mark another array in the same function", () => {
  const t = trace(`${H}${NODE}\nint main() {\nNode* table[5];\nfor (int i = 0; i < 5; i++) table[i] = nullptr;\nint keys[2] = {7, 12};\nfor (int k = 0; k < 2; k++) table[keys[k] % 5] = new Node(keys[k]);\nreturn 0; }`);
  const ls = layouts(t);
  for (const l of ls) {
    for (const m of l.arrays.find((a) => a.title === "table")?.markers ?? []) assert.notEqual(m.label, "k");
  }
  assert.ok(ls.some((l) => l.arrays.find((a) => a.title === "keys")?.markers.some((m) => m.label === "k")));
  const last = ls[t.steps.length - 2];
  assert.equal(last.arrays.at(-1)!.title, "table", "the array of pointers is drawn nearest the nodes");
});

test("only the running call marks the array: waiting recursive calls add no tags", () => {
  const t = trace(`${H}void sortPart(int a[], int left, int right) {\nif (left >= right) return;\na[left] = a[left];\nsortPart(a, left + 1, right);\n}\nint main() {\nint v[4] = {4, 3, 2, 1};\nsortPart(v, 0, 3);\nreturn 0; }`);
  const ls = layouts(t);
  const deep = ls.findIndex((_, i) => t.steps[i].stack.length === 4);
  const strip = ls[deep].arrays.find((a) => a.title === "v")!;
  assert.deepEqual(strip.markers.map((m) => `${m.label}:${m.index}:${m.active}`), ["left:2:true"]);
});

test("a 2-D array is drawn as a grid, with u tagging its row and v its column", () => {
  const t = trace(`${H}int main() {\nint grid[2][3] = {{1, 2, 3}, {4, 5, 6}};\nint u = 1;\nint v = 2;\ngrid[u][v] = 9;\nreturn 0; }`);
  const l = layouts(t)[t.steps.length - 2];
  const s = l.arrays[0];
  assert.deepEqual(s.matrix && [s.matrix.rows, s.matrix.cols], [2, 3]);
  const c = s.cells.find((x) => x.row === 1 && x.col === 2)!;
  assert.equal(c.text, "9");
  assert.equal(c.y, s.cells.find((x) => x.row === 1 && x.col === 0)!.y, "a row shares one y");
  assert.equal(c.x, s.cells.find((x) => x.row === 0 && x.col === 2)!.x, "a column shares one x");
  const u = s.markers.find((m) => m.label === "u")!, v = s.markers.find((m) => m.label === "v")!;
  assert.equal(u.axis, "row");
  assert.ok(u.x + u.width <= s.matrix!.x && u.y >= c.y && u.y + u.height <= c.y + c.height, "u sits left of row 1");
  assert.equal(v.axis, "col");
  assert.ok(v.y + v.height <= s.cellsY && v.x >= c.x && v.x + v.width <= c.x + c.width, "v sits above column 2");
});

test("an adjacency matrix is also drawn as a graph: one line per undirected edge, weights when there are any", () => {
  const t = trace(`${H}int main() {\nint graph[4][4] = {{0, 2, 0, 5}, {2, 0, 3, 0}, {0, 3, 0, 0}, {5, 0, 0, 0}};\nbool visited[4] = {true, true, false, false};\nint dist[4] = {0, 2, 1000000, 5};\nreturn 0; }`);
  const l = layouts(t)[t.steps.length - 2];
  const g = l.arrays.find((a) => a.title === "graph")!.graph!;
  assert.equal(g.vertices.length, 4);
  assert.equal(g.edges.length, 3);
  assert.ok(g.edges.every((e) => !e.directed));
  assert.deepEqual(g.edges.map((e) => e.weight).sort(), ["2", "3", "5"]);
  assert.deepEqual(g.vertices.map((v) => v.visited), [true, true, false, false]);
  assert.deepEqual(g.vertices.map((v) => v.label), ["0", "2", "∞", "5"]);
});

test("a one-way matrix is a directed graph, and an array of adjacency lists is a graph too", () => {
  const dir = trace(`${H}int main() {\nint adj[3][3] = {{0, 1, 0}, {0, 0, 1}, {0, 0, 0}};\nreturn 0; }`);
  const g = layouts(dir)[dir.steps.length - 2].arrays[0].graph!;
  assert.equal(g.edges.length, 2);
  assert.ok(g.edges.every((e) => e.directed && e.weight === undefined));

  const list = trace(`${H}struct Edge {\nint to;\nEdge* next;\n};\nint main() {\nEdge* adj[3];\nfor (int i = 0; i < 3; i++) adj[i] = nullptr;\nEdge* e = new Edge();\ne->to = 2;\ne->next = nullptr;\nadj[0] = e;\nEdge* f = new Edge();\nf->to = 0;\nf->next = nullptr;\nadj[2] = f;\nreturn 0; }`);
  const lg = layouts(list)[list.steps.length - 2].arrays[0].graph!;
  assert.equal(lg.vertices.length, 3);
  assert.equal(lg.edges.length, 1, "0-2 and 2-0 are one undirected edge");
});

test("chains that hang from array cells (adjacency lists) are drawn as one column per cell", () => {
  const t = trace(`${H}struct Edge {\nint to;\nEdge* next;\n};\nvoid add(Edge* adj[], int u, int v) {\nEdge* e = new Edge();\ne->to = v;\ne->next = adj[u];\nadj[u] = e;\n}\nint main() {\nEdge* adj[3];\nfor (int i = 0; i < 3; i++) adj[i] = nullptr;\nadd(adj, 0, 1);\nadd(adj, 0, 2);\nadd(adj, 2, 0);\nreturn 0; }`);
  const l = layouts(t)[t.steps.length - 2];
  const [first, second] = [l.nodes.find((n) => n.id === "h2")!, l.nodes.find((n) => n.id === "h1")!]; // vertex 0's list: 2 then 1
  assert.equal(first.x, second.x, "one column");
  assert.ok(second.y > first.y + first.height, "the next node is below");
  const other = l.nodes.find((n) => n.id === "h3")!;
  assert.notEqual(other.x, first.x, "vertex 2's list is another column");
  assert.ok(l.nodes.every((n) => n.y > l.arrays[0].y + l.arrays[0].height), "below the array");
});

test("a reference parameter and the variable it refers to share one tag", () => {
  const t = trace(`${H}void enqueue(int q[], int& back, int p) {\nq[back] = p;\nback = (back + 1) % 4;\n}\nint main() {\nint q[4];\nint back = 0;\nenqueue(q, back, 7);\nreturn 0; }`);
  const ls = layouts(t);
  const inside = ls.filter((l) => l.arrays.some((a) => a.markers.length > 0));
  assert.ok(inside.length > 0);
  for (const l of inside) for (const a of l.arrays) assert.equal(a.markers.filter((m) => m.label === "back").length, 1);
});
