// Use cases on small screens and with the keyboard only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fixture, runCode, snapshot, setupBrowser, stepTo } from "./harness.mjs";

const { newPage } = setupBrowser();

test("on a phone-sized screen the editor offers the examples and the visualizer has room for the heap", async () => {
  const page = await newPage({ width: 390, height: 844 });
  await page.click("[data-example-menu]");
  await page.click("[data-example-menu-item='reverse']");
  await page.click("[data-run]");
  await page.waitForSelector(".hh-canvas");
  const canvas = await page.$eval(".hh-canvas", (c) => ({ w: c.clientWidth, h: c.clientHeight }));
  assert.ok(canvas.w >= 300 && canvas.h >= 200, JSON.stringify(canvas));
  assert.deepEqual(page.errors, []);
});

test("every control in the visualizer can be reached with Tab and has a name", async () => {
  const page = await newPage();
  await runCode(page, fixture("01_singly_struct_build.cpp"));
  const unnamed = await page.$$eval("button, input, [role='button'], textarea, select", (els) =>
    els.filter((e) => !e.disabled && !(e.getAttribute("aria-label") || e.textContent?.trim() || e.getAttribute("title") || e.labels?.length)).map((e) => e.outerHTML.slice(0, 80)));
  assert.deepEqual(unnamed, []);
  const reached = new Set();
  for (let i = 0; i < 60; i++) {
    await page.keyboard.press("Tab");
    reached.add(await page.evaluate(() => document.activeElement?.getAttribute("aria-label") ?? document.activeElement?.getAttribute("title") ?? document.activeElement?.textContent?.trim().slice(0, 20)));
  }
  for (const name of ["Zoom in", "Fit everything on screen", "Next step (→ or Space)", "Timeline"]) assert.ok(reached.has(name), `${name} not reachable: ${[...reached].join(" | ")}`);
  assert.equal((await snapshot(page)).step, 1, "Tab does not step the program");
});

test("the heap drawing opens at a readable zoom and never spills over the panels beside it", async () => {
  const page = await newPage();
  await runCode(page, fixture("08_singly_struct_reverse.cpp"));
  await stepTo(page, 31);
  await page.click(".hh-node[data-node-id='h2']");
  await page.waitForSelector("[data-inspector]");
  const zoom = Number((await page.$eval("[data-zoom-percent]", (e) => e.textContent)).replace("%", ""));
  assert.ok(zoom >= 45, `opened at ${zoom}%`);
  assert.equal(await page.$eval(".hh-canvas", (c) => c.dataset.lod), "full", "node text is shown");
  const covered = await page.$eval("[data-inspector]", (panel) => {
    const r = panel.getBoundingClientRect();
    for (let y = r.top + 4; y < r.bottom; y += 10) {
      const hit = document.elementFromPoint(r.left + 6, y);
      if (hit && !panel.contains(hit)) return hit.outerHTML.slice(0, 80);
    }
    return null;
  });
  assert.equal(covered, null, "the inspector is not covered by the drawing");
});
