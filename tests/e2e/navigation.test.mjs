// 8.20 Back feels right: between main pages Back goes straight to Home; inside a section it
// goes one step at a time; a page opened directly gets Home underneath it; after logging in,
// Back skips the login form. Also: only the server can make the login page say an account is
// disabled.
import { test } from "node:test";
import assert from "node:assert/strict";
import { setupBrowser, STUDENT } from "./harness.mjs";

const env = setupBrowser();
const origin = () => env.origin();
const where = (page) => new URL(page.url()).pathname + new URL(page.url()).search;

/** A new tab that starts on about:blank, signed in unless `signedOut`. */
async function tab({ signedOut = false } = {}) {
  const page = signedOut ? await (await env.browser().createBrowserContext()).newPage() : await env.browser().newPage();
  await page.setViewport({ width: 1280, height: 860 });
  page.errors = [];
  page.on("pageerror", (e) => page.errors.push(e.message));
  return page;
}
async function go(page, selector) {
  await Promise.all([page.waitForNavigation({ waitUntil: "load" }), page.click(selector)]);
  await page.waitForFunction(() => history.state && history.state.hh); // the page has recorded its place
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** Press Back and wait until the address has really changed (pushState entries resolve early). */
async function back(page) {
  const before = page.url();
  await page.goBack({ waitUntil: "load" }).catch(() => {});
  for (let i = 0; i < 100 && page.url() === before; i++) await sleep(100);
  await page.waitForNetworkIdle({ idleTime: 250, timeout: 10000 }).catch(() => {});
  return where(page);
}
const nav = (href) => `nav[aria-label='Site'] a[href='${href}']`;

test("Home → Learn → Editor → About → FAQ: Back goes straight to Home, then leaves the site", async () => {
  const page = await tab();
  await page.goto(origin() + "/", { waitUntil: "load" });
  for (const href of ["/learn", "/editor", "/about", "/faq"]) {
    await go(page, nav(href));
    assert.equal(where(page), href);
  }
  assert.equal(await back(page), "/");
  assert.ok(await page.$("[data-byte-hero], h1"), "the Home page is shown");
  await page.goBack({ waitUntil: "load" }).catch(() => {});
  assert.equal(page.url(), "about:blank", "the next Back leaves the site");
  assert.deepEqual(page.errors, []);
  await page.close();
});

test("inside Learn, Back goes one step at a time: lesson → topic → Learn → Home", async () => {
  const page = await tab();
  await page.goto(origin() + "/", { waitUntil: "load" });
  await go(page, nav("/learn"));
  await go(page, "[data-topic-card='lists']");
  assert.equal(where(page), "/learn/linked-lists");
  await page.click("[data-lesson]");
  await page.waitForSelector("[data-lesson-card]");
  assert.match(where(page), /^\/learn\/linked-lists\?lesson=/);
  assert.equal(await back(page), "/learn/linked-lists");
  assert.equal(await back(page), "/learn");
  assert.equal(await back(page), "/");
  assert.deepEqual(page.errors, []);
  await page.close();
});

test("leaving Learn from deep inside a lesson, Back still goes straight to Home", async () => {
  const page = await tab();
  await page.goto(origin() + "/", { waitUntil: "load" });
  await go(page, nav("/learn"));
  await go(page, "[data-topic-card='lists']");
  await page.click("[data-lesson]");
  await page.waitForSelector("[data-lesson-card]");
  await Promise.all([page.waitForFunction(() => location.pathname === "/editor", { timeout: 15000 }), page.click(nav("/editor"))]);
  await page.waitForFunction(() => history.state && history.state.hh);
  assert.equal(await back(page), "/");
  await page.close();
});

test("the HeapHop logo returns to the Home already in history instead of adding another", async () => {
  const page = await tab();
  await page.goto(origin() + "/", { waitUntil: "load" });
  await go(page, nav("/faq"));
  await Promise.all([page.waitForFunction(() => location.pathname === "/"), page.click("[data-home-link]")]);
  await page.goBack({ waitUntil: "load" }).catch(() => {});
  assert.equal(page.url(), "about:blank", "Home was the step before, not a new one");
  await page.close();
});

test("a page opened directly gets Home underneath it", async () => {
  const page = await tab();
  await page.goto(origin() + "/about", { waitUntil: "load" });
  assert.equal(await back(page), "/");
  assert.ok(await page.$("[data-byte-hero], h1"));
  await page.goBack({ waitUntil: "load" }).catch(() => {});
  assert.equal(page.url(), "about:blank");
  assert.deepEqual(page.errors, []);
  await page.close();
});

test("after logging in, Back skips the login form and goes to Home", async () => {
  const page = await tab({ signedOut: true });
  await page.goto(origin() + "/", { waitUntil: "load" });
  await Promise.all([page.waitForNavigation({ waitUntil: "load" }), page.click(nav("/learn"))]);
  assert.equal(new URL(page.url()).pathname, "/login");
  await page.type("#f-email", STUDENT.email);
  await page.type("#f-password", STUDENT.password);
  await Promise.all([page.waitForFunction(() => location.pathname === "/learn", { timeout: 15000 }), page.click("[data-login-form] button[type=submit]")]);
  assert.equal(await back(page), "/");
  await page.close();
});

test("a link or a forged header can't make the login page say an account is disabled", async () => {
  const page = await tab({ signedOut: true });
  await page.goto(origin() + "/login?disabled=1&ref=HH-AAAA-BBBB", { waitUntil: "load" });
  assert.equal(await page.$("[data-disabled-notice]"), null, "not from the address");
  await page.setExtraHTTPHeaders({ "x-hh-disabled": "HH-AAAA-BBBB" });
  await page.goto(origin() + "/login", { waitUntil: "load" });
  assert.equal(await page.$("[data-disabled-notice]"), null, "not from a request header");
  await page.setExtraHTTPHeaders({});
  await page.setCookie({ name: "hh_disabled", value: "HH-AAAA-BBBB", domain: "localhost", path: "/login", httpOnly: true });
  await page.goto(origin() + "/login", { waitUntil: "load" });
  assert.ok(await page.$("[data-disabled-notice]"), "the server's own cookie does work (set here only to prove the path)");
  await page.reload({ waitUntil: "load" });
  assert.equal(await page.$("[data-disabled-notice]"), null, "and is used up after one view");
  await page.close();
});
