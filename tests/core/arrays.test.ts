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
