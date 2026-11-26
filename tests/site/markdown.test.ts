import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { cells } from "../../src/app/supported/markdown";

test("a pipe inside `code` stays in its cell instead of starting a new column", () => {
  assert.deepEqual(cells("| `+ - * / %`, comparisons, `&& || !` | yes |"), ["`+ - * / %`, comparisons, `&& || !`", "yes"]);
  assert.deepEqual(cells("| a | b | c |"), ["a", "b", "c"]);
});

test("every table row in the supported-C++ list has as many cells as its header", () => {
  const lines = readFileSync("content/supported-cpp.md", "utf8").split("\n");
  let width = 0;
  for (const line of lines) {
    if (!line.startsWith("|")) { width = 0; continue; }
    const n = cells(line).length;
    if (width === 0) width = n;
    else assert.equal(n, width, line);
  }
});
