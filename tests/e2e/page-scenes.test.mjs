// About, FAQ and Privacy: a full-width header with a live 3D scene, content that uses the
// width of a laptop screen, a short privacy policy, and GitHub links that open a new issue.
import { test } from "node:test";
import assert from "node:assert/strict";
import { setupBrowser, textOf } from "./harness.mjs";

const { newPage } = setupBrowser({ loggedIn: false });
const box = (page, sel) => page.$$eval(sel, (els) => els.map((e) => ({ left: e.offsetLeft, top: e.offsetTop, width: e.offsetWidth })));

test("each page has a full-width header with its own live 3D scene, and no errors", async () => {
  for (const [path, name] of [["/about", "about"], ["/faq", "faq"], ["/privacy", "privacy"]]) {
    const page = await newPage({ path, ready: "[data-page-hero]" });
    assert.ok(await page.$(`[data-page-hero] canvas[data-page-scene='${name}']`), `${path}: its scene is in the header`);
    const hero = await page.$eval("[data-page-hero] > div", (d) => d.offsetWidth);
    assert.ok(hero > 1000, `${path}: the header uses the width (${hero}px)`);
    await new Promise((r) => setTimeout(r, 800));
    assert.deepEqual(page.errors, [], `${path}: no errors, even where WebGL is unavailable`);
    await page.close();
  }
});

test("FAQ questions sit in two columns of cards on a laptop and one column on a phone", async () => {
  const page = await newPage({ path: "/faq", ready: "[data-faq]" });
  const cards = await box(page, "[data-faq]");
  assert.equal(new Set(cards.map((c) => c.left)).size, 2, "two columns");
  await page.click("[data-faq] summary");
  assert.equal(await page.$eval("[data-faq]", (d) => d.open), true);
  const phone = await newPage({ path: "/faq", ready: "[data-faq]", width: 390, height: 844 });
  assert.equal(new Set((await box(phone, "[data-faq]")).map((c) => c.left)).size, 1, "one column on a phone");
});

test("About puts the story and the team side by side; Privacy is a short set of cards in two columns", async () => {
  const about = await newPage({ path: "/about", ready: "[data-team]" });
  const [team] = await box(about, "[data-team]");
  const [story] = await box(about, "section:not([data-team])");
  assert.ok(team.left > story.left + story.width - 10, "team beside the story");
  assert.equal(await about.$$eval("[data-team-member]", (l) => l.length), 5);

  const privacy = await newPage({ path: "/privacy", ready: "[data-privacy-section]" });
  const sections = await box(privacy, "[data-privacy-section]");
  assert.equal(sections.length, 7, "only the necessary sections");
  assert.equal(new Set(sections.map((s) => s.left)).size, 2, "two columns");
  assert.ok((await textOf(privacy, "main")).length < 2600, "short");
});

test("the privacy policy's GitHub links open the new-issue form, the deletion one with its title filled in", async () => {
  const page = await newPage({ path: "/privacy", ready: "[data-delete-request]" });
  const del = new URL(await page.$eval("[data-delete-request]", (a) => a.href));
  assert.equal(del.origin + del.pathname, "https://github.com/SAIMKAXI/HeapHop/issues/new");
  assert.equal(del.searchParams.get("title"), "Please delete my HeapHop account");
  assert.match(del.searchParams.get("body"), /Do not write your email address/);
  assert.equal(await page.$eval("[data-contact]", (a) => a.href), "https://github.com/SAIMKAXI/HeapHop/issues/new");
});
