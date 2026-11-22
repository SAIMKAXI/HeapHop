// Use cases in the visualizer: stepping in both directions, the timeline, crashes and
// limits, the inspector, the code panel, the canvas controls, and every kind of picture.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fixture, runCode, snapshot, stepTo, textOf, setupBrowser } from "./harness.mjs";

const { newPage } = setupBrowser();

test("stepping backwards shows exactly what stepping forwards showed", async () => {
  const page = await newPage();
  await runCode(page, fixture("08_singly_struct_reverse.cpp"));
  const forward = [await snapshot(page)];
  const total = forward[0].steps;
  for (let i = 1; i < total; i++) {
    await page.keyboard.press("ArrowRight");
    forward.push(await snapshot(page));
  }
  assert.equal(forward.at(-1).step, total);
  for (let i = total - 2; i >= 0; i--) {
    await page.keyboard.press("ArrowLeft");
    assert.deepEqual(await snapshot(page), forward[i], `step ${i + 1} differs on the way back`);
  }
  assert.deepEqual(page.errors, []);
});

test("jumping with the timeline and the first / last buttons lands on the same pictures", async () => {
  const page = await newPage();
  await runCode(page, fixture("03_singly_struct_insert_end.cpp"));
  const { steps } = await snapshot(page);
  await stepTo(page, 20);
  const at20 = await snapshot(page);
  await page.click("[title='Go to last step']");
  assert.equal((await snapshot(page)).step, steps);
  await page.click("[title='Go to first step']");
  assert.equal((await snapshot(page)).step, 1);
  await page.$eval("[data-timeline]", (el, target) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, String(target - 1));
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }, 20);
  assert.deepEqual(await snapshot(page), at20);
});

test("the timeline slider works from the keyboard", async () => {
  const page = await newPage();
  await runCode(page, fixture("01_singly_struct_build.cpp"));
  await page.focus("[data-timeline]");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  assert.equal((await snapshot(page)).step, 3);
  await page.keyboard.press("End");
  const s = await snapshot(page);
  assert.equal(s.step, s.steps);
});

test("step over skips the body of a function call", async () => {
  const page = await newPage();
  await runCode(page, fixture("02_singly_struct_insert_front.cpp"));
  const callLine = await page.$$eval("[data-source-line]", (rows) => Number(rows.find((r) => /insertAtBeginning\(head, 30\)/.test(r.textContent)).dataset.sourceLine));
  for (let i = 0; i < 20; i++) {
    const s = await snapshot(page);
    if (s.line === callLine && !s.stack.includes("insertAtBeginning")) break;
    await page.keyboard.press("ArrowRight");
  }
  const before = await snapshot(page);
  await page.keyboard.press("s");
  const after = await snapshot(page);
  assert.ok(after.step > before.step + 3, "several steps were skipped");
  assert.ok(!after.stack.includes("insertAtBeginning"), "and we are back in main");
});

test("play advances on its own and pause stops it", async () => {
  const page = await newPage();
  await runCode(page, fixture("01_singly_struct_build.cpp"));
  await page.click("[title='Faster']");
  await page.click("[title='Faster']");
  await page.click("[title='Auto-play']");
  await new Promise((r) => setTimeout(r, 1500));
  await page.click("[title='Pause']");
  const paused = (await snapshot(page)).step;
  assert.ok(paused > 1);
  await new Promise((r) => setTimeout(r, 900));
  assert.equal((await snapshot(page)).step, paused);
});

test("a focused button is pressed by Space, not treated as 'next step'", async () => {
  const page = await newPage();
  await runCode(page, fixture("01_singly_struct_build.cpp"));
  await page.focus("[title='Go to last step']");
  await page.keyboard.press("Space");
  const s = await snapshot(page);
  assert.equal(s.step, s.steps);
});

test("the program's output so far is shown and grows step by step", async () => {
  const page = await newPage();
  await runCode(page, fixture("01_singly_struct_build.cpp"));
  assert.equal(await page.$("[data-output]"), null, "nothing printed yet");
  await page.click("[title='Go to last step']");
  assert.equal(await textOf(page, "[data-output]"), fixture("01_singly_struct_build.expected.txt"));
});

test("a crash keeps every earlier step and ends on an explained error", async () => {
  const page = await newPage({ path: "/learn?example=forgot-null", ready: ".hh-canvas" });
  assert.match(await textOf(page, "[data-trace-status]"), /Program crashed/);
  await page.click("[title='Go to last step']");
  assert.match(await textOf(page, "[data-explanation]"), /stops here/);
  assert.ok((await snapshot(page)).steps > 5);
});

test("an infinite loop is cut off with a notice and the page stays usable", async () => {
  const page = await newPage();
  await runCode(page, "int main() {\n    int i = 0;\n    while (true) { i++; }\n    return 0;\n}");
  assert.match(await textOf(page, "[data-trace-status]"), /Trace truncated.*ran more than 500 times/);
  await page.keyboard.press("ArrowRight");
  assert.equal((await snapshot(page)).step, 2);
});

test("clicking a node opens the inspector; a history entry jumps the timeline there", async () => {
  const page = await newPage();
  await runCode(page, fixture("08_singly_struct_reverse.cpp"));
  await page.click("[title='Go to last step']");
  await page.keyboard.press("ArrowLeft"); // before the end step, while main is alive
  await page.click(".hh-node[data-node-id='h2']");
  await page.waitForSelector("[data-inspector='object']");
  const sections = await page.$$eval("[data-inspector-section]", (s) => s.map((x) => x.dataset.inspectorSection));
  for (const name of ["Properties", "References", "History", "Explanation", "Related code"]) assert.ok(sections.includes(name), name);
  const target = await page.$eval("[data-history-step]", (b) => Number(b.dataset.historyStep));
  await page.click("[data-history-step]");
  assert.equal((await snapshot(page)).step, target + 1);
  await page.keyboard.press("Escape");
  assert.equal(await page.$("[data-inspector]"), null);
});

test("clicking a pointer in the stack explains where it points and what changed it", async () => {
  const page = await newPage();
  await runCode(page, fixture("01_singly_struct_build.cpp"));
  await stepTo(page, 12);
  await page.click("[data-pointer-cell='f0_head']");
  await page.waitForSelector("[data-inspector='pointer']");
  assert.match(await textOf(page, "[data-pointer-target]"), /Node #1/);
  assert.match(await textOf(page, "[data-pointer-change]"), /Node\* head = new Node\(\)/);
});

test("clicking a code line shows its runs and jumps to the next one", async () => {
  const page = await newPage();
  await runCode(page, fixture("01_singly_struct_build.cpp"));
  const line = await page.$$eval("[data-source-line]", (rows) => rows.find((r) => /temp = temp->next/.test(r.textContent)).dataset.sourceLine);
  await page.click(`[data-source-line='${line}']`);
  await page.waitForSelector("[data-inspector='line']");
  assert.equal(await page.$eval("[data-line-runs]", (e) => e.dataset.lineRuns), "3");
  await page.click("[data-next-run]");
  assert.equal((await snapshot(page)).line, Number(line));
});

test("canvas controls: zoom in and out change the percentage; fit and fullscreen work", async () => {
  const page = await newPage();
  await runCode(page, fixture("10_singly_class_full.cpp"));
  await stepTo(page, 60);
  const percent = () => textOf(page, "[data-zoom-percent]");
  const start = await percent();
  await page.click("[aria-label='Zoom in']");
  await page.waitForFunction((p) => document.querySelector("[data-zoom-percent]").textContent !== p, {}, start);
  await page.click("[aria-label='Zoom out']");
  await page.click("[aria-label='Zoom out']");
  await page.waitForFunction((p) => document.querySelector("[data-zoom-percent]").textContent !== p, {}, start);
  await page.click("[aria-label='Fit everything on screen']");
  // Browser fullscreen: left with the button (Escape is handled by the browser itself).
  await page.click("[aria-label='Fullscreen']");
  await page.waitForSelector("[aria-label='Exit fullscreen']");
  await page.click("[aria-label='Exit fullscreen']");
  await page.waitForSelector("[aria-label='Fullscreen']");
  // Where the browser has no fullscreen (a VS Code webview), the canvas fills the window
  // instead, and Escape leaves that mode.
  await page.evaluate(() => { Element.prototype.requestFullscreen = undefined; });
  await page.click("[aria-label='Fullscreen']");
  await page.waitForSelector("[aria-label='Exit fullscreen']");
  await page.keyboard.press("Escape");
  await page.waitForSelector("[aria-label='Fullscreen']");
});

for (const [file, kind, arrow] of [
  ["03_singly_struct_insert_end.cpp", /singly linked list · 4 nodes/, "next"],
  ["12_doubly_class.cpp", /doubly linked list/, "prev"],
  ["13_circular_struct.cpp", /circular singly linked list · 4 nodes/, "next"],
  ["21_lab9_avl_insert.cpp", /binary tree/, null],
]) {
  test(`${file} is recognised and drawn (${kind.source})`, async () => {
    const page = await newPage();
    await runCode(page, fixture(file));
    let seen = false;
    let arrowSeen = arrow === null;
    const { steps } = await snapshot(page);
    for (let i = 1; i < steps && !(seen && arrowSeen); i++) {
      await page.keyboard.press("ArrowRight");
      const badges = await page.$$eval("[data-list-kind]", (b) => b.map((x) => x.textContent).join(" "));
      seen ||= kind.test(badges);
      if (arrow) arrowSeen ||= (await page.$$(`[data-arrow-kind='${arrow}']`)).length > 0;
    }
    assert.ok(seen, `never saw ${kind}`);
    assert.ok(arrowSeen, `never saw a ${arrow} arrow`);
    assert.deepEqual(page.errors, []);
  });
}

test("going back to the editor keeps the code that was run", async () => {
  const page = await newPage();
  const program = fixture("06_singly_struct_delete_value.cpp");
  await runCode(page, program);
  await page.click("[data-back]");
  await page.waitForSelector("textarea[data-code-input]");
  assert.equal(await page.$eval("textarea[data-code-input]", (t) => t.value), program);
});

test("every example in Learn runs and opens the visualizer", async () => {
  let total = 0;
  for (const topic of ["linked-lists", "doubly-linked-lists"]) {
  const page = await newPage({ path: `/learn/${topic}`, ready: "[data-example]" });
  const ids = await page.$$eval("[data-example]", (e) => e.map((x) => x.dataset.example));
  total += ids.length;
  for (const id of ids) {
    await page.click(`[data-example='${id}']`);
    await page.waitForSelector(".hh-canvas, [data-run-error]");
    assert.equal(await page.$("[data-run-error]"), null, `${id} did not run`);
    await page.click("[data-back]");
    await page.waitForSelector("[data-example]");
  }
  assert.deepEqual(page.errors, []);
  }
  assert.equal(total, 25, "all 25 example programs are on a topic page");
});
