// Browser performance check: stepping and pan / zoom timings next to their budgets,
// measured in Chrome on the built site.
//
//   npm run build && npm run perf             headless
//   npm run build && npm run perf -- --headed  a visible window, using the real graphics card
//
// Run it on the laptop the demo will use; the headless numbers are only a lower bound.
import puppeteer from "puppeteer-core";
import { chromePath, clickRun, setEditorCode } from "./browser.mjs";
import { logIn, startSite, STUDENT } from "../tests/e2e/harness.mjs";
import { startFakeSupabase } from "../tests/e2e/fake-supabase.mjs";

const headed = process.argv.includes("--headed");

const listProgram = (n) => `struct Node { int data; Node* next; };
int main() {
    Node* head = new Node();
    head->data = 0;
    head->next = NULL;
    Node* tail = head;
    for (int i = 1; i < ${n}; i++) {
        tail->next = new Node();
        tail = tail->next;
        tail->data = i;
        tail->next = NULL;
    }
    return 0;
}`;

/** Time from a key press to the next painted frame, for 30 presses alternating ← and →. */
async function stepTimes(page) {
  return page.evaluate(async () => {
    const times = [];
    for (let i = 0; i < 30; i++) {
      const t0 = performance.now();
      window.dispatchEvent(new KeyboardEvent("keydown", { key: i % 2 ? "ArrowRight" : "ArrowLeft", bubbles: true }));
      await new Promise((r) => requestAnimationFrame(() => { times.push(performance.now() - t0); r(); }));
      await new Promise((r) => setTimeout(r, 30));
    }
    return times.sort((a, b) => a - b);
  });
}

/** Longest gap between frames while dragging and wheel-zooming for 120 frames. */
async function panZoom(page) {
  return page.evaluate(async () => {
    const el = document.querySelector(".hh-canvas");
    const box = el.getBoundingClientRect();
    const x = box.left + box.width / 2, y = box.top + box.height / 2;
    const gaps = [];
    let last = performance.now();
    el.dispatchEvent(new PointerEvent("pointerdown", { clientX: x, clientY: y, button: 0, pointerId: 1, bubbles: true }));
    for (let i = 0; i < 120; i++) {
      el.dispatchEvent(new PointerEvent("pointermove", { clientX: x - i * 6, clientY: y + (i % 7), pointerId: 1, bubbles: true }));
      if (i % 10 === 0) el.dispatchEvent(new WheelEvent("wheel", { clientX: x, clientY: y, deltaY: i % 20 ? -60 : 60, bubbles: true, cancelable: true }));
      await new Promise((r) => requestAnimationFrame(r));
      const now = performance.now();
      gaps.push(now - last);
      last = now;
    }
    el.dispatchEvent(new PointerEvent("pointerup", { clientX: x, clientY: y, pointerId: 1, bubbles: true }));
    gaps.shift(); // the first gap includes setting up
    return gaps.sort((a, b) => a - b);
  });
}

const pct = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
const ms = (v) => `${v.toFixed(1)} ms`;

// The editor needs an account, so this runs the real Next.js server (from `npm run build`)
// against the same local stand-in for Supabase the browser tests use, and logs in first.
const supabase = await startFakeSupabase();
await supabase.addUser(STUDENT);
const server = await startSite(supabase);
const browser = await puppeteer.launch({
  executablePath: chromePath(),
  headless: !headed,
  args: headed ? [] : ["--no-sandbox"],
  defaultViewport: { width: 1440, height: 900 },
});
await logIn(browser, server.origin);
const page = await browser.newPage();
await page.goto(`${server.origin}/editor`, { waitUntil: "load" });
await page.waitForSelector("textarea[data-code-input]");

// What this machine and browser do with no work at all, to read the numbers against.
const idle = await browser.newPage();
await idle.setContent("<p>idle</p>");
const idleGaps = await idle.evaluate(async () => {
  const gaps = [];
  let last = performance.now();
  for (let i = 0; i < 120; i++) {
    await new Promise((r) => requestAnimationFrame(r));
    const now = performance.now();
    gaps.push(now - last);
    last = now;
  }
  gaps.shift();
  return gaps.sort((a, b) => a - b);
});
await idle.close();

console.log(`HeapHop browser performance (${headed ? "visible window" : "headless"})\n`);
const rows = [["empty page, for comparison", `p95 ${ms(pct(idleGaps, 0.95))}, worst ${ms(idleGaps.at(-1))}`, "-", true]];
for (const [n, stepBudget] of [[50, 16], [200, 50]]) {
  await setEditorCode(page, listProgram(n));
  await clickRun(page);
  await page.click("[title='Go to last step']");
  await page.keyboard.press("ArrowLeft"); // the list is complete, main is still running
  const steps = await stepTimes(page);
  const frames = await panZoom(page);
  rows.push([`${n} nodes: Next / Previous`, `median ${ms(pct(steps, 0.5))}, worst ${ms(steps.at(-1))}`, `${stepBudget} ms`, steps.at(-1) <= stepBudget + 1]);
  rows.push([`${n} nodes: pan and zoom`, `p95 ${ms(pct(frames, 0.95))}, worst ${ms(frames.at(-1))}`, "16 ms per frame", pct(frames, 0.95) <= 17]);
  await page.click("[data-back]");
  await page.waitForSelector("textarea[data-code-input]");
}
for (const [what, measured, budget, ok] of rows) console.log(`${what.padEnd(28)} ${measured.padEnd(34)} budget ${budget.padEnd(16)} ${ok ? "ok" : "OVER"}`);
console.log("\nA step update is ready on the next frame, so about 16 ms is the floor on a 60 Hz screen.");

await browser.close();
await server.close();
await supabase.close();
