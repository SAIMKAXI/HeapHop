// Use cases for the visualizer's layout: the lesson card never covers the heap drawing,
// and the code and stack panels can be resized (and stay that way).
import { test } from "node:test";
import assert from "node:assert/strict";
import { fixture, runCode, setupBrowser, snapshot } from "./harness.mjs";

const { newPage } = setupBrowser();

const rect = (page, selector) => page.$eval(selector, (e) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
const overlaps = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

for (const lesson of ["insert-at-front", "build-a-bst"]) {
  test(`lesson ${lesson}: at every stop, no node is hidden behind the lesson card`, async () => {
    const page = await newPage({ path: `/learn?lesson=${lesson}`, ready: "[data-lesson-card]" });
    let checked = 0;
    for (let stop = 0; ; stop++) {
      await page.waitForFunction(() => !document.querySelector("[data-lesson-travelling]"));
      await new Promise((r) => setTimeout(r, 400));
      const card = await rect(page, "[data-lesson-card]");
      const nodes = await page.$$eval(".hh-node", (all) => all.map((n) => { const r = n.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; }));
      for (const n of nodes) assert.ok(!overlaps(n, card), `stop ${stop + 1}: a node is under the lesson card`);
      if (nodes.length > 0) checked++;
      if (await page.$eval("[data-lesson-next]", (b) => b.disabled)) break;
      await page.click("[data-lesson-next]");
    }
    assert.ok(checked >= 3, "most stops have nodes to check");
    assert.deepEqual(page.errors, []);
  });
}

test("folding the lesson card gives the heap more room, and unfolding brings the lesson back", async () => {
  const page = await newPage({ path: "/learn?lesson=reverse-a-list", ready: "[data-lesson-card]" });
  const open = (await rect(page, ".hh-canvas")).h;
  await page.click("[data-lesson-fold]");
  assert.equal(await page.$("[data-lesson-text], [data-prediction-result], [data-lesson-next]"), null);
  assert.ok((await rect(page, ".hh-canvas")).h > open + 40, "the heap grows");
  await page.click("[data-lesson-fold]");
  await page.waitForSelector("[data-lesson-next]");
});

test("the code and stack panels resize by dragging or with the keyboard, and keep their size after a reload", async () => {
  const page = await newPage();
  await runCode(page, fixture("01_singly_struct_build.cpp"));
  const width = (panel) => rect(page, `[data-panel='${panel}']`).then((r) => Math.round(r.w));
  assert.equal(await width("code"), 400);
  assert.equal(await width("stack"), 300);

  const handle = await rect(page, "[aria-label='Resize the code panel']");
  await page.mouse.move(handle.x + handle.w / 2, handle.y + handle.h / 2);
  await page.mouse.down();
  await page.mouse.move(handle.x + handle.w / 2 + 150, handle.y + handle.h / 2, { steps: 5 });
  await page.mouse.up();
  assert.equal(await width("code"), 550);

  const step = (await snapshot(page)).step;
  await page.focus("[aria-label='Resize the stack panel']");
  await page.keyboard.press("ArrowRight");
  assert.equal(await width("stack"), 316);
  assert.equal((await snapshot(page)).step, step, "arrow keys on a divider resize instead of stepping");

  await page.reload({ waitUntil: "load" });
  await page.waitForSelector("textarea[data-code-input]");
  await runCode(page, fixture("01_singly_struct_build.cpp"));
  assert.equal(await width("code"), 550);
  assert.equal(await width("stack"), 316);

  await page.click("[aria-label='Resize the code panel']", { count: 2 });
  assert.equal(await width("code"), 400, "double-click resets");
  assert.deepEqual(page.errors, []);
});

test("a panel cannot be dragged so wide that the heap disappears", async () => {
  const page = await newPage();
  await runCode(page, fixture("01_singly_struct_build.cpp"));
  const handle = await rect(page, "[aria-label='Resize the code panel']");
  await page.mouse.move(handle.x + 2, handle.y + 100);
  await page.mouse.down();
  await page.mouse.move(handle.x + 2000, handle.y + 100, { steps: 5 });
  await page.mouse.up();
  assert.ok((await rect(page, "[data-panel='heap']")).w >= 318);
});

test("on a short window the lesson card stays inside the heap panel and never covers the step explanation", async () => {
  const page = await newPage({ width: 1536, height: 560, path: "/learn?lesson=insert-at-front", ready: "[data-lesson-card]" });
  await page.click("[data-lesson-next]"); // stop 2 has the longest text
  await page.waitForFunction(() => !document.querySelector("[data-lesson-travelling]"));
  await new Promise((r) => setTimeout(r, 600));
  const card = await rect(page, "[data-lesson-card]");
  const heap = await rect(page, "[data-panel='heap']");
  const bar = await rect(page, "[data-step]");
  assert.ok(card.y + card.h <= heap.y + heap.h + 1, "the card ends inside the heap panel");
  assert.ok(card.y + card.h <= bar.y, "and above the explanation bar");
  assert.ok((await rect(page, ".hh-canvas")).h >= 100, "the drawing keeps some room");
});
