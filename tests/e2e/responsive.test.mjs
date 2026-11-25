// 8.21 Every screen size: every page fits from a 320 px phone to a 4K monitor, upright and
// sideways; phones get a menu button and Code / Memory tabs; a phone held sideways shows code and
// memory side by side; big screens scale up together.
import { test } from "node:test";
import assert from "node:assert/strict";
import { clickRun } from "../../scripts/browser.mjs";
import { ADMIN, setupBrowser } from "./harness.mjs";
import { layoutProblems, SIZES, viewportFor } from "./layout-check.mjs";

const env = setupBrowser();
const origin = () => env.origin();
const LESSON = "/learn/linked-lists?lesson=walk-a-list";

/** A tab watching for page errors. `who`: the signed-in student (default), a visitor, or the admin. */
async function tab(who = "student") {
  let page;
  if (who === "student") page = await env.browser().newPage();
  else {
    page = await (await env.browser().createBrowserContext()).newPage();
    if (who === "admin") {
      await page.goto(origin() + "/login", { waitUntil: "load" });
      await page.type("#f-email", ADMIN.email);
      await page.type("#f-password", ADMIN.password);
      await Promise.all([page.waitForNavigation({ waitUntil: "load" }), page.click("[data-login-form] button[type=submit]")]);
    }
  }
  page.errors = [];
  page.on("pageerror", (e) => page.errors.push(e.message));
  return page;
}

async function open(page, path, [w, h]) {
  await page.setViewport(viewportFor(w, h));
  await page.goto(origin() + path, { waitUntil: "load" });
  await new Promise((r) => setTimeout(r, 250)); // let the layout settle after hydration
}

/** Checks one page at every size and fails with every problem found, by size. */
async function fitsEverywhere(page, path, after) {
  const found = [];
  for (const size of SIZES) {
    await open(page, path, size);
    if (after) await after(page);
    const problems = await layoutProblems(page);
    if (problems.length) found.push(`${size.join("x")}: ${problems.join("; ")}`);
  }
  assert.deepEqual(found, [], `${path} does not fit:\n${found.join("\n")}`);
  assert.deepEqual(page.errors, []);
}

const runInEditor = async (page) => {
  await clickRun(page);
  await page.waitForSelector("[data-panel=heap]");
};

for (const path of ["/", "/learn", "/learn/linked-lists", LESSON, "/editor", "/about", "/faq", "/privacy", "/supported", "/account", "/no-such-page"]) {
  test(`${path} fits every screen, from a 320 px phone to 4K, upright and sideways`, async () => {
    const page = await tab();
    await fitsEverywhere(page, path);
    await page.close();
  });
}

test("a program running in the editor fits every screen", async () => {
  const page = await tab();
  await fitsEverywhere(page, "/editor", runInEditor);
  await page.close();
});

test("the admin page fits every screen; on a phone each user is a card", async () => {
  const page = await tab("admin");
  await fitsEverywhere(page, "/admin");
  await open(page, "/admin", [390, 844]);
  const row = await page.$eval("[data-user-row]", (r) => getComputedStyle(r).display);
  assert.equal(row, "flex", "a card, not a squeezed table row");
  await page.close();
});

for (const path of ["/", "/login", "/signup", "/forgot-password"]) {
  test(`${path} fits every screen for a visitor who is not signed in`, async () => {
    const page = await tab("visitor");
    await fitsEverywhere(page, path);
    await page.close();
  });
}

test("on a phone the page links are in a menu button; Escape closes it", async () => {
  const page = await tab();
  await open(page, "/learn", [390, 844]);
  const visible = (sel) => page.$eval(sel, (e) => e.getBoundingClientRect().height > 0 && getComputedStyle(e).visibility !== "hidden").catch(() => false);
  assert.equal(await visible("nav[aria-label='Site']"), false, "no room for the row of links");
  assert.equal(await visible("[data-menu-panel]"), false);
  await page.click("[data-menu-button]");
  assert.equal(await visible("[data-menu-panel]"), true);
  assert.deepEqual(await page.$$eval("nav[aria-label='Site menu'] a", (a) => a.map((x) => x.getAttribute("href"))), ["/learn", "/editor", "/about", "/faq"]);
  assert.equal(await page.$eval("nav[aria-label='Site menu'] a[aria-current=page]", (a) => a.textContent), "Learn");
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("href")), "/learn", "focus moves into the menu");
  await page.keyboard.press("Escape");
  assert.equal(await visible("[data-menu-panel]"), false);
  assert.equal(await page.evaluate(() => document.activeElement?.hasAttribute("data-menu-button")), true, "and back to the button");
  await page.click("[data-menu-button]");
  await Promise.all([page.waitForFunction(() => location.pathname === "/about"), page.click("nav[aria-label='Site menu'] a[href='/about']")]);
  await page.waitForSelector("h1");
  await open(page, "/learn", [1280, 800]);
  assert.equal(await visible("[data-menu-button]"), false, "laptops keep the row of links");
  assert.equal(await visible("nav[aria-label='Site']"), true);
  assert.deepEqual(page.errors, []);
  await page.close();
});

test("a visitor's phone menu has Log in and Sign up, and the header stays on one line", async () => {
  const page = await tab("visitor");
  await open(page, "/", [320, 568]);
  assert.equal(await page.$eval("[data-login-link]", (e) => e.getBoundingClientRect().height), 0, "not squeezed into the header");
  await page.click("[data-menu-button]");
  assert.ok(await page.$("[data-menu-panel] a[href='/login']"));
  assert.ok(await page.$("[data-menu-panel] a[href='/signup']"));
  const header = await page.$eval("header", (h) => h.getBoundingClientRect().height);
  assert.ok(header < 64, `one line (${header} px)`);
  await page.close();
});

test("a phone held upright switches between Code and Memory; a laptop shows both", async () => {
  const page = await tab();
  await open(page, "/editor", [390, 844]);
  await runInEditor(page);
  const shown = (sel) => page.$eval(sel, (e) => e.getBoundingClientRect().height > 0);
  assert.equal(await page.$eval("[data-view-tab=memory]", (t) => t.getAttribute("aria-selected")), "true", "memory first");
  assert.equal(await shown("[data-panel=heap]"), true);
  assert.equal(await shown("[data-panel=code]"), false);
  assert.match(await page.$eval("[data-view-tab=code]", (t) => t.textContent), /line \d+/, "the Code tab says which line runs");
  await page.click("[data-view-tab=code]");
  assert.equal(await shown("[data-panel=code]"), true);
  assert.equal(await shown("[data-panel=heap]"), false);
  const controls = await page.$eval("[data-timeline]", (t) => t.getBoundingClientRect().bottom);
  assert.ok(controls <= 844, "the timeline stays on screen");
  await open(page, "/editor", [1280, 800]); // switching from phone to laptop emulation reloads the page
  await runInEditor(page);
  assert.equal(await shown("[role=tablist]"), false);
  assert.equal(await shown("[data-panel=code]"), true);
  assert.equal(await shown("[data-panel=heap]"), true);
  assert.deepEqual(page.errors, []);
  await page.close();
});

test("a phone held sideways shows code beside memory, with the controls on screen", async () => {
  const page = await tab();
  for (const size of [[844, 390], [667, 375]]) {
    await open(page, LESSON, size);
    await page.waitForSelector("[data-lesson-card]");
    const box = (sel) => page.$eval(sel, (e) => { const b = e.getBoundingClientRect(); return { left: b.left, right: b.right, top: b.top, bottom: b.bottom, height: b.height }; });
    const code = await box("[data-panel=code]");
    const heap = await box("[data-panel=heap] .hh-canvas");
    assert.ok(code.right <= heap.left + 1, `side by side at ${size}`);
    assert.ok(code.height >= 70, `at least three lines of code (${code.height} px)`);
    assert.ok(heap.height >= 150, `room for the heap (${heap.height} px)`);
    assert.ok((await box("[data-lesson-card]")).right <= heap.left + 1, "the lesson sits under the code, not on the heap");
    assert.ok((await box("[data-timeline]")).bottom <= size[1], "the timeline is on screen");
  }
  assert.deepEqual(page.errors, []);
  await page.close();
});

test("on a phone, tapping a node opens the inspector as a sheet from the bottom", async () => {
  const page = await tab();
  await open(page, LESSON, [390, 844]);
  await page.waitForSelector(".hh-node");
  await page.$eval(".hh-node", (n) => n.dispatchEvent(new MouseEvent("click", { bubbles: true })));
  await page.waitForSelector("[data-inspector]");
  const sheet = await page.$eval("[data-inspector]", (e) => { const b = e.getBoundingClientRect(); return { left: b.left, right: b.right, bottom: b.bottom }; });
  assert.deepEqual([Math.round(sheet.left), Math.round(sheet.right), Math.round(sheet.bottom)], [0, 390, 844]);
  await page.click("[aria-label='Close inspector']");
  assert.equal(await page.$("[data-inspector]"), null);
  await page.close();
});

test("on a phone the heap is drawn large enough to read (swipe for the rest)", async () => {
  const page = await tab();
  await open(page, LESSON, [390, 844]);
  await page.waitForSelector(".hh-node");
  await new Promise((r) => setTimeout(r, 400));
  const zoom = await page.$eval("[data-zoom-percent]", (e) => parseInt(e.textContent, 10));
  assert.ok(zoom >= 70, `zoom ${zoom}%`);
  await page.close();
});

test("big screens scale the whole page up together; laptops are unchanged", async () => {
  const page = await tab();
  const measure = async (size) => {
    await open(page, "/about", size);
    return page.evaluate(() => ({ font: parseFloat(getComputedStyle(document.documentElement).fontSize), content: document.querySelector("main .max-w-6xl").getBoundingClientRect().width }));
  };
  assert.deepEqual(await measure([1440, 900]), { font: 16, content: 1152 });
  const big = await measure([2560, 1440]);
  assert.equal(big.font, 20, "125% at 2560 px");
  assert.equal(big.content, 1440);
  assert.equal((await measure([3840, 2160])).font, 24, "never more than 150%");
  await page.close();
});
