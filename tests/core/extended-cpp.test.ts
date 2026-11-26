// The VS Code extension's larger C++: the STL containers, templates, exceptions, inheritance,
// lambdas, pointer arithmetic, <iomanip>. Each fixture prints exactly what g++ printed for it,
// and the website (no extended mode) still refuses all of it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { run } from "../../src/core/interpreter";
import { TraceModel } from "../../src/core/trace";
import { layoutArrays } from "../../src/layout/arrays";
import { EXTENSION_LIMITS, type Step, type Trace } from "../../src/core/types";
import { last, variable } from "./helpers";

const EXT = { extended: true };
const HEAD = "#include <bits/stdc++.h>\nusing namespace std;\n";
const main = (body: string, before = "") => `${HEAD}${before}\nint main() {\n${body}\nreturn 0;\n}\n`;

function trace(code: string, input = ""): Trace {
  const r = run(code, EXTENSION_LIMITS, input, EXT);
  if (!r.ok) assert.fail(`expected a trace, got ${r.error.kind}: ${r.error.message}`);
  return r.trace;
}

function stopsWith(code: string, pattern: RegExp): Step {
  const t = trace(code);
  assert.equal(t.status, "error", "the program should stop with an error");
  const end = last(t);
  assert.match(end.error!.message, pattern);
  return end;
}

// ---- g++ agreement -------------------------------------------------------------

const dir = join(__dirname, "..", "fixtures", "ext");
const files = readdirSync(dir).filter((f) => f.endsWith(".cpp")).sort();

test("there are fixtures for the extension's C++", () => {
  assert.ok(files.length >= 17);
});

for (const file of files) {
  test(`fixture ${file} prints what g++ printed`, () => {
    const code = readFileSync(join(dir, file), "utf8");
    assert.match(code, /^\/\/ label: /);
    const expected = readFileSync(join(dir, file.replace(/\.cpp$/, ".expected.txt")), "utf8");
    const inputFile = join(dir, file.replace(/\.cpp$/, ".input.txt"));
    const t = trace(code, existsSync(inputFile) ? readFileSync(inputFile, "utf8") : "");
    assert.equal(t.status, "completed", t.notice);
    assert.equal(t.output, expected);
  });
}

// ---- the website keeps its current behaviour --------------------------------------

test("without the extended mode (the website), none of it is accepted", () => {
  const samples = [
    main("vector<int> v;"),
    main("try { throw 1; } catch (int e) {}"),
    main("", "template <typename T> T id(T x) { return x; }"),
    main("", "class A {}; class B : public A {};"),
    main("auto f = [](int a) { return a; };"),
    main("int a[3] = {1, 2, 3}; int* p = a; p++;"),
    main("cout << INT_MAX;"),
  ];
  for (const code of samples) {
    const r = run(code, undefined, "", {});
    if (r.ok && r.trace.status === "completed") assert.fail(`the website accepted:\n${code}`);
  }
});

// ---- behaviour -------------------------------------------------------------------

test("an exception no catch takes stops the program and says what was thrown", () => {
  stopsWith(main('vector<int> v(2);\ncout << v.at(5);'), /std::out_of_range .*vector::_M_range_check.*no catch block took it/);
  stopsWith(main('throw runtime_error("boom");'), /std::runtime_error \("boom"\)/);
});

test("an abstract class cannot be made, and the error names the pure virtual method", () => {
  const r = run(main("Shape s;", "class Shape { public: virtual double area() = 0; };"), EXTENSION_LIMITS, "", EXT);
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.error.message, /abstract class: area\(\) is pure virtual/);
});

test("pop() on an empty stack or queue stops with an explanation", () => {
  stopsWith(main("stack<int> s;\ns.pop();"), /empty stack/);
  stopsWith(main("queue<int> q;\nq.front();"), /empty queue/);
});

test("a vector is a row of elements with its capacity doubling like libstdc++", () => {
  const t = trace(main("vector<int> v;\nfor (int i = 0; i < 5; i++) v.push_back(i);\ncout << v.capacity();"));
  assert.equal(t.output, "8");
  const v = variable(t.steps[t.steps.length - 2], "v");
  assert.equal(v.kind, "array");
  assert.equal(v.typeName, "vector<int>[5]");
  assert.deepEqual(v.children!.map((c) => c.value), ["0", "1", "2", "3", "4"]);
});

test("a node class declared inside a class template is called by its own name", () => {
  const code = main("List<int> l;\nl.add(1);\nl.add(2);", "template <class T> class List { struct Node { T v; Node* next; Node(T x) : v(x), next(nullptr) {} }; Node* head = nullptr; public: void add(T x) { Node* n = new Node(x); n->next = head; head = n; } };");
  const t = trace(code);
  const model = new TraceModel(t);
  const step = t.steps.findLast((s) => s.heap.length === 2)!;
  assert.deepEqual(step.heap.map((h) => model.nameOf(h.id)), ["Node #1", "Node #2"]);
  assert.equal(step.heap[0].typeName, "List<int>::Node");
});

test("a priority_queue is drawn with its heap tree, a map as key: value cells", () => {
  const t = trace(main("priority_queue<int> pq;\nfor (int x : {5, 1, 9, 3}) pq.push(x);\nmap<string, int> m;\nm[\"a\"] = 1;\nm[\"b\"] = 2;\nint end = 0;"));
  const step = t.steps[t.steps.length - 2];
  const { strips } = layoutArrays(step, 0, new Map());
  const heap = strips.find((s) => s.title === "pq")!;
  assert.ok(heap.heap, "the priority_queue has a heap view");
  assert.deepEqual(heap.cells.map((c) => c.text), ["9", "3", "5", "1"]);
  const map = strips.find((s) => s.title === "m")!;
  assert.deepEqual(map.cells.map((c) => c.text), ['"a": 1', '"b": 2']);
});

test("vector<int> adj[V] is drawn as a graph, even with a vertex that has no edges", () => {
  const t = trace(main("vector<int> adj[4];\nadj[0].push_back(1);\nadj[1].push_back(0);\nadj[1].push_back(2);\nadj[2].push_back(1);\nint end = 0;"));
  const { strips } = layoutArrays(t.steps[t.steps.length - 2], 0, new Map());
  const g = strips.find((s) => s.title === "adj")!;
  assert.ok(g.graph, "drawn as a graph");
  assert.equal(g.graph!.vertices.length, 4);
  assert.equal(g.graph!.edges.length, 2);
});

test("sort with a comparator compares in exactly libstdc++'s order", () => {
  const code = main("vector<int> v;\nfor (int i = 0; i < 30; i++) v.push_back((i * 7) % 30);\nsort(v.begin(), v.end(), [](int a, int b) { calls++; return a / 5 < b / 5; });\nfor (int x : v) cout << x << ' ';\ncout << calls;", "int calls = 0;");
  // g++ -std=c++17: same order of equal-by-comparator elements, same number of comparisons
  assert.equal(trace(code).output, "0 1 4 3 2 6 8 5 9 7 12 10 11 14 13 18 16 15 17 19 22 20 24 21 23 29 27 26 25 28 150");
});
