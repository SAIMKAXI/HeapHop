// One browser and one static server for a test file, serving the built site in out/.
// Run `npm run build` first; `npm run e2e` does both.
import { after, before } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { clickRun, launchBrowser, serveStatic, setEditorCode } from "../../scripts/browser.mjs";

const OUT = join(import.meta.dirname, "..", "..", "out");
const FIXTURES = join(import.meta.dirname, "..", "fixtures");

export const fixture = (name) => readFileSync(join(FIXTURES, name), "utf8");

/**
 * Sets up the browser for the calling test file and returns helpers bound to it.
 * Every page records page errors and console errors; `newPage` fails the test on any.
 */
export function setupBrowser() {
  const ctx = {};
  before(async () => {
    assert.ok(existsSync(join(OUT, "index.html")), "out/ is missing: run `npm run build` first");
    ctx.server = await serveStatic(OUT);
    ctx.browser = await launchBrowser();
  });
  after(async () => {
    await ctx.browser?.close();
    await ctx.server?.close();
  });

  return {
    /** A fresh page (the editor unless `path` says otherwise), with empty local storage unless `keepStorage`. */
    async newPage({ width = 1440, height = 900, keepStorage = false, path = "/editor", ready = "textarea[data-code-input]" } = {}) {
      const page = await ctx.browser.newPage();
      page.errors = [];
      page.on("pageerror", (e) => page.errors.push(e.message));
      page.on("console", (m) => { if (m.type() === "error") page.errors.push(m.text()); });
      await page.setViewport({ width, height });
      await page.goto(ctx.server.origin + path, { waitUntil: "load" });
      if (!keepStorage) {
        await page.evaluate(() => localStorage.clear());
        await page.reload({ waitUntil: "load" });
      }
      await page.waitForSelector(ready);
      return page;
    },
    origin: () => ctx.server.origin,
  };
}

/** Put code (and optional cin input) in the editor and run it. */
export async function runCode(page, code, input) {
  await setEditorCode(page, code);
  if (input !== undefined) {
    await page.waitForSelector("[data-program-input]");
    await page.evaluate((text) => {
      const box = document.querySelector("[data-program-input]");
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call(box, text);
      box.dispatchEvent(new Event("input", { bubbles: true }));
    }, input);
  }
  await clickRun(page);
}

/** What the student sees at the current step, as plain data. */
export function snapshot(page) {
  return page.evaluate(() => {
    const badge = document.querySelector("[data-step]");
    return {
      step: Number(badge?.dataset.step),
      steps: Number(badge?.dataset.steps),
      line: Number(document.querySelector("[data-active-line]")?.dataset.sourceLine ?? 0),
      explanation: document.querySelector("[data-explanation]")?.textContent ?? "",
      nodes: [...document.querySelectorAll(".hh-node")].map((n) => n.dataset.nodeId).sort().join(","),
      arrows: [...document.querySelectorAll("[data-arrow-id]")].map((a) => `${a.dataset.arrowId}:${a.dataset.arrowKind}`).sort().join(","),
      stack: [...document.querySelectorAll("[data-stack-frame]")].map((f) => f.textContent).join("|"),
    };
  });
}

export const stepTo = async (page, target) => {
  for (let guard = 0; guard < 5000; guard++) {
    const { step } = await snapshot(page);
    if (step === target) return;
    await page.keyboard.press(step < target ? "ArrowRight" : "ArrowLeft");
  }
  throw new Error(`could not reach step ${target}`);
};

export const textOf = (page, selector) => page.$eval(selector, (el) => el.textContent ?? "");
