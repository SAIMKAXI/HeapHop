// Use cases in the editor: the starter program, errors before a run, typing helpers,
// the student's programs, theme, keyboard shortcut, and program input for cin.
import { test } from "node:test";
import assert from "node:assert/strict";
import { setEditorCode } from "../../scripts/browser.mjs";
import { fixture, runCode, textOf, setupBrowser } from "./harness.mjs";

const { newPage } = setupBrowser();
const code = (page) => page.$eval("textarea[data-code-input]", (t) => t.value);

test("the editor opens on a starter program the first time, and on the last program after that", async () => {
  const page = await newPage();
  assert.equal(await code(page), "#include <iostream>\nusing namespace std;\n\nint main() {\n    \n    return 0;\n}\n");
  assert.deepEqual(await page.$$eval("[data-snippet]", (s) => s.map((x) => x.textContent)), ["My program"]);
  assert.equal(await page.$("[data-lesson], [data-example]"), null, "lessons and examples live in Learn");
  await setEditorCode(page, fixture("01_singly_struct_build.cpp"));
  await page.reload({ waitUntil: "load" });
  await page.waitForFunction((p) => document.querySelector("textarea[data-code-input]")?.value === p, {}, fixture("01_singly_struct_build.cpp"));
  assert.deepEqual(page.errors, []);
});

test("a syntax error stays in the editor and names the line", async () => {
  const page = await newPage();
  await runCode(page, "int main() {\n  int x = 5\n  return 0;\n}");
  assert.match(await textOf(page, "[data-run-error]"), /Line 2: .*missing a ";"/);
  assert.equal(await page.$(".hh-canvas"), null);
});

test("unsupported C++ gets a readable message", async () => {
  const page = await newPage();
  await runCode(page, "#include <vector>\nint main() { vector<int> v; return 0; }");
  assert.match(await textOf(page, "[data-run-error]"), /Line 2: .*is not supported yet/);
  await Promise.all([page.waitForNavigation(), page.click("[data-supported-link]")]);
  assert.match(await textOf(page, "main h1"), /supports/);
  assert.ok((await page.$$("main table, main li")).length > 5, "the supported list is rendered");
});

test("an empty program is reported instead of running", async () => {
  const page = await newPage();
  await runCode(page, "// nothing yet");
  assert.match(await textOf(page, "[data-run-error]"), /nothing to run/i);
});

test("Ctrl+Enter runs the program", async () => {
  const page = await newPage();
  await setEditorCode(page, fixture("01_singly_struct_build.cpp"));
  await page.focus("textarea[data-code-input]");
  await page.keyboard.down("Control");
  await page.keyboard.press("Enter");
  await page.keyboard.up("Control");
  await page.waitForSelector(".hh-canvas");
});

test("typing helpers: Tab indents, brackets close themselves, Enter after { indents", async () => {
  const page = await newPage();
  await setEditorCode(page, "");
  await page.focus("textarea[data-code-input]");
  await page.keyboard.type("int main(");
  assert.equal(await code(page), "int main()");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.type(" {");
  assert.equal(await code(page), "int main() {}");
  await page.keyboard.press("Enter");
  assert.equal(await code(page), "int main() {\n    \n}");
  await page.keyboard.type("x");
  await page.keyboard.press("Tab");
  assert.equal(await code(page), "int main() {\n    x    \n}");
});

test("programs: a new one keeps its name and code after a reload; deleting the last leaves a fresh starter", async () => {
  const page = await newPage();
  await page.click("[data-new-snippet]");
  await page.waitForSelector("[data-snippet] input");
  await page.$eval("[data-snippet] input", (i) => { i.value = "My list"; });
  await page.keyboard.press("Enter");
  const program = "int main() {\n    int saved = 42;\n    return 0;\n}";
  await setEditorCode(page, program);
  await page.reload({ waitUntil: "load" });
  await page.waitForFunction((p) => document.querySelector("textarea[data-code-input]")?.value === p, {}, program);
  assert.deepEqual(await page.$$eval("[data-snippet]", (s) => s.map((x) => x.textContent)), ["My program", "My list"]);
  for (let left = 2; left > 0; left--) await page.click("[data-snippet] [data-delete-snippet]");
  assert.deepEqual(await page.$$eval("[data-snippet]", (s) => s.map((x) => x.textContent)), ["My program"]);
  assert.match(await code(page), /^#include <iostream>/);
  assert.deepEqual(page.errors, []);
});

test("the light theme is remembered", async () => {
  const page = await newPage();
  await page.click("[data-theme-toggle]");
  assert.equal(await page.evaluate(() => document.documentElement.classList.contains("light")), true);
  await page.reload({ waitUntil: "load" });
  await page.waitForSelector("textarea[data-code-input]");
  assert.equal(await page.evaluate(() => document.documentElement.classList.contains("light")), true);
});

test("cin: the input box appears only for programs that read input, and the run uses it", async () => {
  const page = await newPage();
  await setEditorCode(page, fixture("01_singly_struct_build.cpp"));
  assert.equal(await page.$("[data-program-input]"), null);
  await runCode(page, fixture("26_lab6_array_stack_menu.cpp"), fixture("26_lab6_array_stack_menu.input.txt"));
  await page.click("[title='Go to last step']");
  assert.equal(await textOf(page, "[data-output]"), fixture("26_lab6_array_stack_menu.expected.txt"));
});

test("cin: too little input ends the trace with a notice about the input box", async () => {
  const page = await newPage();
  await runCode(page, "#include <iostream>\nusing namespace std;\nint main() {\n    int a, b;\n    cin >> a >> b;\n    cout << a + b;\n    return 0;\n}", "5");
  assert.match(await textOf(page, "[data-trace-status]"), /Program input/);
});
