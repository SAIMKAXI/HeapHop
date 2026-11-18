// Use cases for the robot: it acts out single steps, goes home when the student plays or
// jumps, can be switched off (and stays off), and starts off on devices that ask for
// reduced motion.
import { test } from "node:test";
import assert from "node:assert/strict";
import { runCode, setupBrowser, snapshot, stepTo } from "./harness.mjs";

const { newPage } = setupBrowser();

const LIST = `#include <iostream>
using namespace std;
struct Node { int data; Node* next; Node(int d) : data(d), next(nullptr) {} };
int main() {
    Node* a = new Node(10);
    Node* b = new Node(20);
    a->next = b;
    Node* cur = a;
    cur = cur->next;
    return 0;
}
`;

const robotAt = (page) => page.$eval("[data-robot] > g", (g) => g.getAttribute("transform").match(/translate\(([-\d.]+) ([-\d.]+)\)/).slice(1).map(Number));
const nodeAt = (page, id) => page.$eval(`.hh-node[data-node-id="${id}"]`, (n) => n.style.transform.match(/translate\(([-\d.]+)px, ([-\d.]+)px\)/).slice(1).map(Number));
const settled = (page) => new Promise((r) => setTimeout(r, 2500)).then(() => page);

/** The step that runs `a->next = b;`. */
async function linkStep(page) {
  for (let i = 1; ; i++) {
    await stepTo(page, i);
    if ((await snapshot(page)).explanation.includes("next of Node #1 now points at Node #2")) return i;
  }
}

test("stepping forward over a->next = b: the robot carries the arrow, then sits on Node #2; stepping back, it sits on Node #1", async () => {
  const page = await newPage();
  await runCode(page, LIST);
  const link = await linkStep(page);
  await stepTo(page, link - 1);
  await settled(page);
  await page.keyboard.press("ArrowRight");
  await page.waitForSelector("[data-arrow-id][data-robot-hidden]", { timeout: 2000 });
  await settled(page);
  assert.equal(await page.$("[data-robot-hidden]"), null, "the real arrow is back once the robot lets go");
  const [bx, by] = await nodeAt(page, "h2");
  assert.deepEqual(await robotAt(page), [bx + 148 - 28, by], "standing on Node #2");

  await page.keyboard.press("ArrowLeft");
  await settled(page);
  const [ax, ay] = await nodeAt(page, "h1");
  assert.deepEqual(await robotAt(page), [ax + 148 - 28, ay], "standing on Node #1");
  assert.deepEqual(page.errors, []);
});

test("the robot goes home at the first step, during auto-play and after a jump on the timeline", async () => {
  const page = await newPage();
  await runCode(page, LIST);
  const home = await robotAt(page);
  await page.keyboard.press("ArrowRight");
  await settled(page);
  assert.notDeepEqual(await robotAt(page), home, "the first new node is dropped in and the robot stands on it");
  await page.keyboard.press("ArrowLeft");
  await settled(page);
  assert.deepEqual(await robotAt(page), home, "back at the first step");

  await page.click("button[title='Auto-play']");
  await page.waitForFunction(() => Number(document.querySelector("[data-step]").dataset.step) >= 3);
  assert.deepEqual(await robotAt(page), home, "auto-play only draws");
  await page.click("button[title='Pause']");

  await page.$eval("[data-timeline]", (e) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(e, "6");
    e.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await settled(page);
  assert.deepEqual(await robotAt(page), home, "a jump does not animate");
  assert.deepEqual(page.errors, []);
});

test("the robot switch hides it, and the choice is remembered after a reload", async () => {
  const page = await newPage();
  await runCode(page, LIST);
  assert.equal(await page.$eval("[data-robot-toggle]", (b) => b.getAttribute("aria-pressed")), "true");
  await page.click("[data-robot-toggle]");
  assert.equal(await page.$("[data-robot]"), null);
  await page.reload({ waitUntil: "load" });
  await page.waitForSelector("textarea[data-code-input]");
  await runCode(page, LIST);
  assert.equal(await page.$("[data-robot]"), null, "still off");
  await page.click("[data-robot-toggle]");
  assert.ok(await page.$("[data-robot]"));
});

test("on a device that asks for reduced motion the robot starts off", async () => {
  const page = await newPage();
  await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
  await page.reload({ waitUntil: "load" });
  await page.waitForSelector("textarea[data-code-input]");
  await runCode(page, LIST);
  assert.equal(await page.$("[data-robot]"), null);
  assert.equal(await page.$eval("[data-robot-toggle]", (b) => b.getAttribute("aria-pressed")), "false");
});
