// Gate 2: every fixture prints exactly what g++ printed, and every built-in example still runs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { run } from "../../src/core/interpreter";
import { EXAMPLES } from "../../content/examples";

const dir = join(__dirname, "..", "fixtures");
const files = readdirSync(dir).filter((f) => f.endsWith(".cpp")).sort();

test("there are fixtures to check", () => {
  assert.ok(files.length >= 15);
});

for (const file of files) {
  test(`fixture ${file} matches g++`, () => {
    const code = readFileSync(join(dir, file), "utf8");
    assert.match(code, /^\/\/ label: /, "every fixture starts with a one-line label");
    const expected = readFileSync(join(dir, file.replace(/\.cpp$/, ".expected.txt")), "utf8");
    const inputFile = join(dir, file.replace(/\.cpp$/, ".input.txt"));
    const r = run(code, undefined, existsSync(inputFile) ? readFileSync(inputFile, "utf8") : "");
    if (!r.ok) assert.fail(r.error.message);
    assert.equal(r.trace.status, "completed", r.trace.notice);
    assert.equal(r.trace.output, expected);
  });
}

for (const ex of EXAMPLES) {
  test(`built-in example "${ex.title}" runs`, () => {
    const r = run(ex.code);
    if (!r.ok) assert.fail(r.error.message);
    assert.notEqual(r.trace.status, "truncated", r.trace.notice);
  });
}
