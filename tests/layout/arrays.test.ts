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

test("an array-based queue shows front and rear above the cells they name", () => {
  const t = trace(fixture("25_lab7_circular_array_queue.cpp"));
  const ls = layouts(t);
  const l = ls.find((x) => x.arrays.some((a) => a.markers.some((m) => m.label === "front" && m.index >= 0) && a.markers.some((m) => m.label === "rear" && m.index >= 0)))!;
  const strip = l.arrays.find((a) => a.title.endsWith(".arr"))!;
  for (const m of strip.markers) {
    const cell = strip.cells.find((c) => c.index === m.index)!;
    assert.ok(m.x >= cell.x && m.x + m.width <= cell.x + cell.width, `${m.label} sits over cell ${m.index}`);
    assert.ok(m.y + m.height <= strip.cellsY, `${m.label} is above the cells`);
  }
});

test("an empty array stack shows top = -1 just left of cell 0, and a long array shows a window of cells", () => {
  const t = trace(fixture("26_lab6_array_stack_menu.cpp"), undefined);
  const ls = layouts(t);
  const first = ls.find((l) => l.arrays.some((a) => a.markers.some((m) => m.label === "topIndex")))!;
  const strip = first.arrays.find((a) => a.markers.some((m) => m.label === "topIndex"))!;
  const marker = strip.markers.find((m) => m.label === "topIndex")!;
  assert.equal(marker.index, -1);
  assert.ok(marker.x + marker.width / 2 < strip.cells[0].x, "the marker is centred left of cell 0");
  assert.equal(strip.length, 1000);
  assert.equal(strip.cells.length, 16);
  assert.equal(strip.hiddenAfter, 984);
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
