// 8.15 Learn: a hero with Byte pointing at the heading, nine topic cards in a 3x3 grid, a row for
// the Editor and the references, and a page per topic with its lessons and example programs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { setupBrowser, textOf } from "./harness.mjs";

const { newPage, origin } = setupBrowser();

test("the Learn page: heading, Byte pointing, nine topic cards in three equal rows, and the bottom row", async () => {
  const page = await newPage({ path: "/learn", ready: "[data-topic-card]" });
  assert.match(await textOf(page, "h1"), /Learn C\+\+ visually\./);
  await page.waitForFunction(() => { const i = document.querySelector("[data-byte-point]"); return i?.complete && i.naturalWidth > 0; });
  assert.match(await textOf(page, "[data-learn-stats]"), /51\s*lessons.*9\s*topics.*25\s*example programs/s);
  // Layout positions (offset*), which the fade-in's moving transform doesn't change.
  const cards = await page.$$eval("[data-topic-card]", (a) => a.map((x) => ({
    topic: x.dataset.topicCard, href: x.getAttribute("href"), top: x.parentElement.offsetTop, width: x.offsetWidth, height: x.offsetHeight, art: !!x.querySelector("svg[data-topic-art]"),
  })));
  assert.deepEqual(cards.map((c) => c.href), ["/learn/sorting", "/learn/linked-lists", "/learn/doubly-linked-lists", "/learn/stacks", "/learn/queues", "/learn/binary-search-trees", "/learn/avl-trees", "/learn/heaps", "/learn/graphs"]);
  assert.ok(cards.every((c) => c.art), "every card has its drawing");
  const rows = [...new Set(cards.map((c) => c.top))];
  assert.equal(rows.length, 3, `three rows: ${rows}`);
  assert.equal(new Set(cards.map((c) => c.width)).size, 1, "equal widths");
  for (const r of rows) assert.equal(new Set(cards.filter((c) => c.top === r).map((c) => c.height)).size, 1, "equal heights in a row");
  assert.equal(await page.$eval("[data-learn-practice] a", (a) => a.getAttribute("href")), "/editor");
  assert.deepEqual(await page.$$eval("[data-learn-references] a", (a) => a.map((x) => x.getAttribute("href"))), ["/supported", "/faq"]);
  assert.deepEqual(page.errors, []);
});

test("a topic page lists its lessons and example programs and links to the topics around it", async () => {
  const page = await newPage({ path: "/learn", ready: "[data-topic-card]" });
  await Promise.all([page.waitForNavigation({ waitUntil: "load" }), page.click("[data-topic-card='lists']")]);
  assert.equal(new URL(page.url()).pathname, "/learn/linked-lists");
  assert.equal(await textOf(page, "h1"), "Linked lists");
  assert.equal(await page.$$eval("[data-lesson]", (l) => l.length), 8);
  assert.equal(await page.$$eval("[data-example]", (l) => l.length), 23);
  assert.deepEqual(await page.$$eval("[data-topic-nav] a", (a) => a.map((x) => x.getAttribute("href"))), ["/learn/sorting", "/learn/doubly-linked-lists"]);
  assert.match(await page.title(), /Linked lists/);

  const graphs = await newPage({ path: "/learn/graphs", ready: "[data-lesson]" });
  assert.equal(await graphs.$("[data-topic-examples]"), null, "no empty examples section");
  assert.deepEqual(await graphs.$$eval("[data-topic-nav] a", (a) => a.map((x) => x.getAttribute("href"))), ["/learn/heaps"]);
  await Promise.all([graphs.waitForNavigation({ waitUntil: "load" }), graphs.click("[data-back-to-topics]")]);
  assert.equal(new URL(graphs.url()).pathname, "/learn");
  assert.deepEqual([...page.errors, ...graphs.errors], []);
});

test("an unknown topic is a 404", async () => {
  const page = await newPage({ path: "/learn", ready: "[data-topic-card]" });
  const res = await page.goto(origin() + "/learn/no-such-topic", { waitUntil: "load" });
  assert.equal(res.status(), 404);
  assert.match(await textOf(page, "main"), /404/);
});
