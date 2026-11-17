// Runs every program in tests/fixtures through the interpreter and compares what it
// prints with the real g++ output saved next to it.
//   npm run fixtures
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { run } from "../src/core/interpreter";

const dir = join(__dirname, "..", "tests", "fixtures");
const files = readdirSync(dir).filter((f) => f.endsWith(".cpp")).sort();

let pass = 0;
for (const file of files) {
  const code = readFileSync(join(dir, file), "utf8");
  const expected = readFileSync(join(dir, file.replace(/\.cpp$/, ".expected.txt")), "utf8");
  // Programs that read from cin have their keyboard input saved next to them.
  const inputFile = join(dir, file.replace(/\.cpp$/, ".input.txt"));
  const result = run(code, undefined, existsSync(inputFile) ? readFileSync(inputFile, "utf8") : "");
  let verdict: string;
  if (!result.ok) {
    verdict = `ERROR   ${result.error.message}`;
  } else if (result.trace.output === expected) {
    verdict = `ok      ${result.trace.steps.length} steps`;
    pass++;
  } else {
    verdict = `WRONG   output differs from g++`;
  }
  console.log(`${file.padEnd(44)} ${verdict}`);
}
console.log(`\n${pass}/${files.length} fixtures match g++`);
