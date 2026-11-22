// Use cases across the site: the landing page and its demo, the navigation, the content
// pages, and Learn's addresses (opening, sharing and leaving a lesson).
import { test } from "node:test";
import assert from "node:assert/strict";
import { setupBrowser, textOf } from "./harness.mjs";

const { newPage, origin } = setupBrowser();
const PAGES = ["/", "/learn", "/editor", "/faq", "/about", "/privacy", "/supported"];

test("the landing page plays a live demo and leads to Learn and the Editor", async () => {
  const page = await newPage({ path: "/", ready: "[data-live-demo] .hh-node" });
  const stepText = () => page.$eval("[data-live-demo]", (d) => d.textContent.match(/step (\d+)/)?.[1]);
  const first = await stepText();
  await page.waitForFunction((s) => document.querySelector("[data-live-demo]").textContent.match(/step (\d+)/)?.[1] !== s, { timeout: 5000 }, first);
  await page.click("[data-live-demo] button[aria-label='Pause the demo']");
  const paused = await stepText();
  await new Promise((r) => setTimeout(r, 1500));
  assert.equal(await stepText(), paused, "pausing stops the demo");
  assert.deepEqual(await page.$$eval("[data-cta]", (a) => a.map((x) => x.getAttribute("href"))), ["/learn", "/editor"]);
  assert.deepEqual(page.errors, []);
  await Promise.all([page.waitForNavigation(), page.click("[data-cta='editor']")]);
  await page.waitForSelector("textarea[data-code-input]");
});

test("every page loads without errors, marks itself in the navigation, and every link on it works", async () => {
  const links = new Set();
  for (const path of PAGES) {
    const page = await newPage({ path, ready: "header" });
    const current = await page.$$eval("header nav [aria-current='page']", (a) => a.map((x) => x.getAttribute("href")));
    if (["/learn", "/editor", "/faq", "/about"].includes(path)) assert.deepEqual(current, [path], `${path} is marked in the header`);
    for (const href of await page.$$eval("a[href^='/']", (a) => a.map((x) => x.getAttribute("href")))) links.add(href);
    assert.deepEqual(page.errors, [], path);
    await page.close();
  }
  for (const href of links) {
    const res = await fetch(origin() + href);
    assert.equal(res.status, 200, `${href} is reachable`);
  }
});

test("About lists the five team members, FAQ answers open, Privacy says the code stays in the browser", async () => {
  const page = await newPage({ path: "/about", ready: "[data-team-member]" });
  assert.deepEqual(await page.$$eval("[data-team-member] span span:first-child", (s) => s.map((x) => x.textContent)),
    ["M. Saim", "Yemna Khan", "Muhammad Musa", "Eeman Athar Malik", "Syeda Nazalia Zehra"]);
  await page.goto(origin() + "/faq");
  await page.click("[data-faq] summary");
  assert.equal(await page.$eval("[data-faq]", (d) => d.open), true);
  await page.goto(origin() + "/privacy");
  const privacy = await textOf(page, "main");
  assert.match(privacy, /never\s+uploaded/);
  for (const must of [/Full name/, /Email address/, /University or college/, /one-way hash/, /Sign-in cookies/, /Supabase/, /Mumbai/, /Vercel/, /Deleting your account/, /do not write your email address/i]) assert.match(privacy, must);
  for (const stale of [/no accounts/i, /no cookies/i, /no personal information/i]) assert.doesNotMatch(privacy, stale);
  await page.goto(origin() + "/about");
  assert.doesNotMatch(await textOf(page, "main"), /no accounts|does not collect any data/i);
});

test("Learn: opening a lesson changes the address, Back returns to its topic, and a shared link opens the lesson", async () => {
  const page = await newPage({ path: "/learn/binary-search-trees", ready: "[data-lesson]" });
  await page.click("[data-lesson='build-a-bst']");
  await page.waitForSelector("[data-lesson-card]");
  assert.equal(new URL(page.url()).search, "?lesson=build-a-bst");
  assert.match(await textOf(page, "[data-back]"), /Binary search trees/, "Back names the topic");
  await page.goBack();
  await page.waitForSelector("[data-topic='bst']");
  assert.equal(new URL(page.url()).pathname, "/learn/binary-search-trees");
  assert.equal(new URL(page.url()).search, "");

  await page.goto(origin() + "/learn?lesson=search-a-bst");
  await page.waitForSelector("[data-lesson-card]");
  await page.click("[data-back]");
  await page.waitForSelector("[data-topic-grid]");
  assert.equal(new URL(page.url()).pathname, "/learn");
  assert.equal(new URL(page.url()).search, "");

  await page.goto(origin() + "/learn?lesson=no-such-lesson");
  assert.match(await page.waitForSelector("[data-run-error]").then((e) => e.evaluate((x) => x.textContent)), /no lesson called "no-such-lesson"/);
  assert.deepEqual(page.errors, []);
});
