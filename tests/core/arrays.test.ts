// Arrays passed to functions, string indexing, and which cells a step read (Stage 11.4).
import { test } from "node:test";
import assert from "node:assert/strict";
import { last, rejected, trace } from "./helpers";

const prog = (pre: string, body: string) => `#include <iostream>\n#include <string>\nusing namespace std;\n${pre}\nint main() {\n${body}\nreturn 0; }`;

test("an array passed to a function is the same array, so the function can sort it in place", () => {
  const t = trace(prog(
    `void bubble(int a[], int n) { for (int i = 0; i < n - 1; i++) for (int j = 0; j < n - i - 1; j++) if (a[j] > a[j + 1]) swap(a[j], a[j + 1]); }`,
    `int a[5] = {4, 1, 5, 2, 3}; bubble(a, 5); for (int i = 0; i < 5; i++) cout << a[i];`));
  assert.equal(t.output, "12345");
});

test("a pointer can be set to an array and indexed", () => {
  assert.equal(trace(prog("", `int arr[3] = {1, 2, 3}; int* p = arr; p[1] = 9; int* q; q = arr; q[2] = 7; cout << arr[1] << arr[2];`)).output, "97");
});

test("inside the function the parameter points at the caller's array", () => {
  const t = trace(prog(`void fill(int* a, int n) { for (int i = 0; i < n; i++) a[i] = i; }`, `int arr[2]; fill(arr, 2);`));
  const call = t.steps.find((s) => s.activeFunction === "fill")!;
  const a = call.stack[1].variables.find((v) => v.name === "a")!;
  assert.equal(a.pointsTo, "f0_arr");
});

test("a string can be read one character at a time", () => {
  assert.equal(trace(prog("", `string s = "a(b)"; int open = 0; for (int i = 0; i < s.length(); i++) { char c = s[i]; if (c == '(') open++; } cout << open << s[1];`)).output, "1(");
});

test("reading past the end of a string stops with a clear error", () => {
  const t = trace(prog("", `string s = "ab"; char c = s[5];`));
  assert.equal(last(t).error?.code, "out_of_bounds");
});

test("changing one character of a string is reported as not supported yet", () => {
  assert.match(rejected(prog("", `string s = "ab"; s[0] = 'x';`)).message, /one character of a string/);
});

test("a step lists the array cells it read, such as the two values a comparison looked at", () => {
  const t = trace(prog("", `int a[3] = {5, 9, 1};\nif (a[1] > a[2]) {\ncout << "yes";\n}`));
  const condition = t.steps.find((s) => s.kind === "condition")!;
  assert.deepEqual(condition.read, ["f0_a_1", "f0_a_2"]);
  assert.ok(t.steps.filter((s) => s !== condition).every((s) => !s.read?.includes("f0_a_2")), "reads belong to the step that made them");
});

test("2-D arrays: declare, fill with nested braces, read and write by row and column", () => {
  const t = trace(prog("", `int g[3][3] = {{0, 1, 0}, {1, 0, 1}, {0, 1, 0}};\nint m[2][3];\nfor (int i = 0; i < 2; i++) for (int j = 0; j < 3; j++) m[i][j] = i * 3 + j;\ng[2][0] += 5;\ncout << g[1][2] << m[1][2] << g[2][0];`));
  assert.equal(t.output, "155");
  const g = t.steps.at(-2)!.stack[0].variables.find((v) => v.name === "g")!;
  assert.equal(g.label, "int g[3][3]");
  assert.equal(g.children![1].children![2].id, "f0_g_1_2");
});

test("2-D arrays: a function can take one as int g[][3] and change the caller's cells", () => {
  const t = trace(prog(`const int V = 3;\nvoid addEdge(int g[][V], int u, int v) { g[u][v] = 1; g[v][u] = 1; }`, `int adj[V][V] = {};\naddEdge(adj, 0, 2);\ncout << adj[2][0] << adj[0][2] << adj[1][1];`));
  assert.equal(t.output, "110");
});

test("2-D arrays: a member array of a class", () => {
  const t = trace(prog(`class Graph {\npublic:\n  int adj[2][2];\n  Graph() { for (int i = 0; i < 2; i++) for (int j = 0; j < 2; j++) adj[i][j] = 0; }\n};`, `Graph g;\ng.adj[0][1] = 7;\ncout << g.adj[0][1] << g.adj[1][0];`));
  assert.equal(t.output, "70");
});

test("2-D arrays: an index outside a row stops with a clear error", () => {
  const t = trace(prog("", `int g[2][2] = {{1, 2}, {3, 4}};\nint x = g[1][5];`));
  assert.equal(last(t).error?.code, "out_of_bounds");
});
