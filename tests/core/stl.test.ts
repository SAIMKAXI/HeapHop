// std::list (switched on by the VS Code extension): programs print what g++ prints, the
// picture is made of real nodes, the g++ naming rules hold, and the classic mistakes stop
// with an explanation instead of a wrong picture.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { run } from "../../src/core/interpreter";
import { TraceModel } from "../../src/core/trace";
import { explainStep } from "../../src/core/explain";
import { detectLists } from "../../src/core/structures";
import type { Step, Trace } from "../../src/core/types";
import { field, last, lastLive, variable } from "./helpers";

const STL = { stl: true };
const HEAD = "#include <iostream>\n#include <list>\nusing namespace std;\n";

function trace(code: string, input = ""): Trace {
  const r = run(code, undefined, input, STL);
  if (!r.ok) assert.fail(`expected a trace, got ${r.error.kind}: ${r.error.message}`);
  return r.trace;
}

function rejected(code: string, features: { stl?: boolean } = STL) {
  const r = run(code, undefined, "", features);
  if (r.ok) assert.fail("expected the program to be rejected");
  return r.error;
}

/** The error step a program must stop at. */
function stopsWith(code: string, pattern: RegExp): Step {
  const t = trace(code);
  assert.equal(t.status, "error", "the program should stop with an error");
  const end = last(t);
  assert.equal(end.kind, "error");
  assert.match(end.error!.message, pattern);
  return end;
}

const main = (body: string) => `${HEAD}int main() {\n${body}\nreturn 0;\n}\n`;

// ---- g++ agreement ---------------------------------------------------------

const dir = join(__dirname, "..", "fixtures", "stl");
const files = readdirSync(dir).filter((f) => f.endsWith(".cpp")).sort();

test("there are std::list fixtures", () => {
  assert.ok(files.length >= 10);
});

for (const file of files) {
  test(`std::list fixture ${file} matches g++ and leaks nothing`, () => {
    const code = readFileSync(join(dir, file), "utf8");
    assert.match(code, /^\/\/ label: /);
    const expected = readFileSync(join(dir, file.replace(/\.cpp$/, ".expected.txt")), "utf8");
    const inputFile = join(dir, file.replace(/\.cpp$/, ".input.txt"));
    const t = trace(code, existsSync(inputFile) ? readFileSync(inputFile, "utf8") : "");
    assert.equal(t.status, "completed", t.notice);
    assert.equal(t.output, expected);
    assert.match(last(t).explanation, /Every object created with new was deleted/);
  });
}

// ---- the website keeps its current behaviour ------------------------------

test("without the stl feature (the website), std::list is still not supported", () => {
  const e = rejected(main("list<int> nums;\nnums.push_back(1);"), {});
  assert.equal(e.kind, "unsupported");
  assert.match(e.message, /standard-library container/);
});

test("without the stl feature, auto keeps its old message", () => {
  const e = rejected(main("auto x = 5;"), {});
  assert.match(e.message, /auto is not supported/);
});

// ---- naming rules, as g++ applies them ---------------------------------------

test("list needs its header", () => {
  const e = rejected("#include <iostream>\nusing namespace std;\nint main() { list<int> a; return 0; }");
  assert.equal(e.kind, "parse");
  assert.match(e.message, /#include <list>/);
});

test("bits/stdc++.h counts as including list", () => {
  trace("#include <bits/stdc++.h>\nusing namespace std;\nint main() { list<int> a; a.push_back(1); return 0; }");
});

test("plain list needs using namespace std or using std::list", () => {
  const e = rejected("#include <list>\nint main() { list<int> a; return 0; }");
  assert.match(e.message, /Write std::list, or add using namespace std;/);
  trace("#include <list>\nusing std::list;\nint main() { list<int> a; return 0; }");
  trace("#include <list>\nint main() { std::list<int> a; std::list<int>::iterator it = a.begin(); return 0; }");
});

test("a program's own list class clashes with std::list exactly when g++ says so", () => {
  const own = "struct list { int v; list* next; };\nint main() { list* p = nullptr; return 0; }";
  // No <list>: the program's own class is used, as in g++.
  trace(`#include <iostream>\nusing namespace std;\n${own}`);
  const e = rejected(`#include <iostream>\n#include <list>\nusing namespace std;\n${own}`);
  assert.match(e.message, /"list" is ambiguous/);
  assert.equal(e.line, 5);
});

test("other containers give a readable error that names std::list as the supported one", () => {
  const e = rejected(`${HEAD}#include <vector>\nint main() { vector<int> v; return 0; }`);
  assert.equal(e.kind, "unsupported");
  assert.match(e.message, /supports std::list/);
});

test("lists of lists and reverse iterators are refused with a hint", () => {
  assert.match(rejected(main("list<list<int>> g;")).message, /A list of lists/);
  assert.match(rejected(main("list<int>::reverse_iterator r;")).message, /--it/);
});

// ---- the picture --------------------------------------------------------------

test("a list is an object with head, tail and size, and its nodes are real heap objects", () => {
  const t = trace(main("list<int> nums = {4, 8, 15};\nlist<int>::iterator it = nums.begin();\n++it;\nlist<int>::iterator e = nums.end();"));
  const step = lastLive(t);
  const nums = variable(step, "nums");
  assert.equal(nums.typeName, "list<int>");
  assert.equal(field(nums, "size").value, "3");
  assert.equal(step.heap.length, 3);
  assert.ok(step.heap.every((h) => h.typeName === "list<int>::node" && !h.orphaned));
  assert.equal(field(nums, "head").pointsTo, step.heap[0].id);
  assert.equal(field(nums, "tail").pointsTo, step.heap[2].id);
  assert.equal(field(step.heap[1], "value").value, "8");

  const it = variable(step, "it");
  assert.equal(it.typeName, "list<int>::iterator");
  assert.equal(it.kind, "pointer");
  assert.equal(it.pointsTo, step.heap[1].id);
  assert.equal(variable(step, "e").value, "end()");

  const shapes = detectLists(step);
  assert.equal(shapes.lists.length, 1);
  assert.equal(shapes.lists[0].kind, "doubly");
  assert.deepEqual(shapes.lists[0].nodes, step.heap.map((h) => h.id));
});

test("auto takes the iterator type, so the variable is labelled with it", () => {
  const t = trace(main("list<string> w = {\"a\"};\nauto it = w.begin();\nauto n = w.size();"));
  const step = lastLive(t);
  assert.equal(variable(step, "it").typeName, "list<string>::iterator");
  assert.equal(variable(step, "n").typeName, "int");
});

test("a list's nodes are deleted when its variable ends, so nothing is reported as leaked", () => {
  const t = trace(main("{\nlist<int> inner;\ninner.push_back(1);\ninner.push_back(2);\n}\nint x = 0;"));
  const step = lastLive(t);
  assert.equal(step.heap.length, 0);
  assert.equal(t.status, "completed");
});

test("explanations talk about the list's nodes and iterators in list terms", () => {
  const t = trace(main("list<int> nums;\nnums.push_back(3);\nlist<int>::iterator it = nums.begin();\n++it;\nnums.pop_back();"));
  const model = new TraceModel(t);
  const text = (i: number) => explainStep(model, i).map((s) => s.text).join(" ");
  const push = t.steps.findIndex((s) => s.sourceLine === 6);
  assert.match(text(push), /The list makes node #1 on the heap/);
  const inc = t.steps.findIndex((s) => s.sourceLine === 8);
  assert.match(text(inc), /`it` is now end\(\)/);
  const pop = t.steps.findIndex((s) => s.sourceLine === 9);
  assert.match(text(pop), /taken out of the list and deleted/);
});

// ---- the classic mistakes stop with an explanation -----------------------------

test("pop_back, front and back on an empty list stop the run", () => {
  stopsWith(main("list<int> a;\na.pop_back();"), /pop_back\(\) is called on an empty list/);
  stopsWith(main("list<int> a;\nint x = a.front();"), /front\(\) is called on an empty list/);
});

test("*it at end() stops the run", () => {
  const step = stopsWith(main("list<int> a = {1};\nlist<int>::iterator it = a.end();\nint x = *it;"), /end\(\), which stands one place past the last element/);
  assert.equal(step.sourceLine, 7);
});

test("using an iterator after erasing its element stops with advice", () => {
  const code = main("list<int> a = {1, 2, 3};\nlist<int>::iterator it = a.begin();\na.erase(it);\n++it;");
  const t = trace(code);
  assert.match(last(t).error!.message, /no longer valid: the element it pointed at was erased on line 7/);
  const advice = explainStep(new TraceModel(t), t.steps.length - 1).map((s) => s.text).join(" ");
  assert.match(advice, /Carry on with the iterator erase\(\) gives back/);
});

test("the dangling iterator is shown as dangling before it is used", () => {
  const t = trace(main("list<int> a = {1, 2};\nlist<int>::iterator it = a.begin();\na.erase(it);\nint x = 0;"));
  assert.equal(variable(lastLive(t), "it").dangling, true);
});

test("moving past end() or before begin() stops the run", () => {
  stopsWith(main("list<int> a = {1};\nlist<int>::iterator it = a.end();\n++it;"), /already end\(\)/);
  stopsWith(main("list<int> a = {1};\nlist<int>::iterator it = a.begin();\n--it;"), /at begin\(\)/);
});

test("erasing inside a range-for loop stops when the loop tries to move on", () => {
  stopsWith(main("list<int> a = {1, 2, 3};\nfor (int x : a) {\nif (x == 2) a.remove(2);\n}"), /range-for loop was standing on was erased/);
});

test("an iterator of one list cannot be a position in another", () => {
  stopsWith(main("list<int> a = {1};\nlist<int> b = {2};\na.insert(b.begin(), 5);"), /belongs to a different list/);
});

test("iterator arithmetic and printing an iterator are compile errors, as in g++", () => {
  const plus = rejected(main("list<int> a = {1, 2};\nlist<int>::iterator it = a.begin();\nit = it + 1;"));
  assert.match(plus.message, /cannot be used with \+/);
  assert.equal(plus.line, 7);
  assert.match(rejected(main("list<int> a = {1};\ncout << a.begin();")).message, /cannot print an iterator/);
});

// ---- drawing ------------------------------------------------------------------

test("an array of lists is drawn as an adjacency list: a row of cells, each list hanging from its cell", async () => {
  const { layoutArrays } = await import("../../src/layout/arrays");
  const t = trace(readFileSync(join(dir, "10_dfs_member_array.cpp"), "utf8"));
  const step = t.steps.findLast((s) => s.heap.length >= 8)!;
  const { strips } = layoutArrays(step, 0, new Map());
  const adj = strips.find((s) => s.title === "g.adj");
  assert.ok(adj, "g.adj is drawn as an array strip");
  assert.equal(adj.cells.length, 5);
  assert.ok(adj.cells[0].pointer && adj.cells[0].pointsTo, "cell 0 points at the first node of adj[0]");
  // Named adj, so it is also drawn as the graph it stands for: 4 undirected edges.
  assert.ok(adj.graph, "adj is drawn as a graph too");
  assert.equal(adj.graph.vertices.length, 5);
  assert.equal(adj.graph.edges.length, 4);
});

test("list nodes are called node #N, with the element type only when two kinds of list are used", () => {
  const one = new TraceModel(trace(main("list<int> a = {1, 2};")));
  assert.deepEqual([...new Set(one.trace.steps.flatMap((s) => s.heap.map((h) => one.nameOf(h.id))))], ["node #1", "node #2"]);
  const two = new TraceModel(trace(main("list<int> a = {1};\nlist<string> b = {\"x\"};")));
  const names = new Set(two.trace.steps.flatMap((s) => s.heap.map((h) => two.nameOf(h.id))));
  assert.deepEqual([...names].sort(), ["int node #1", "string node #1"]);
});

test("a list of pairs (or of another container) is refused with a hint", () => {
  const e = rejected(main("list<pair<int, int>> edges;"));
  assert.equal(e.kind, "unsupported");
  assert.match(e.message, /A list of pair<\.\.\.>.*struct with two fields/);
});
