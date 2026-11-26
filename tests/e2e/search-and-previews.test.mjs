// Search engines and link previews: robots.txt lists only what anyone may open, the sitemap
// names the public pages, and a shared link shows HeapHop's title, description and picture.
import { test } from "node:test";
import assert from "node:assert/strict";
import { setupBrowser } from "./harness.mjs";

const { newPage, origin } = setupBrowser({ loggedIn: false });
const SITE = "https://heaphop.vercel.app";

test("robots.txt keeps crawlers out of the pages behind the login and points at the sitemap", async () => {
  const res = await fetch(origin() + "/robots.txt");
  assert.equal(res.status, 200);
  const text = await res.text();
  for (const path of ["/learn", "/editor", "/account", "/admin"]) assert.match(text, new RegExp(`Disallow: ${path}\\n`));
  assert.match(text, /Allow: \/\n/);
  assert.match(text, new RegExp(`Sitemap: ${SITE}/sitemap.xml`));
});

test("the sitemap lists the public pages and nothing behind the login", async () => {
  const res = await fetch(origin() + "/sitemap.xml");
  assert.equal(res.status, 200);
  const urls = [...(await res.text()).matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].replace(SITE, "") || "/");
  assert.deepEqual(urls.sort(), ["/", "/about", "/faq", "/login", "/privacy", "/signup", "/supported"]);
});

test("a shared link shows the title, the description and the preview picture", async () => {
  const page = await newPage({ path: "/", ready: "header" });
  const meta = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll("meta[property^='og:'], meta[name^='twitter:']")]
    .map((m) => [m.getAttribute("property") ?? m.getAttribute("name"), m.getAttribute("content")])));
  assert.equal(meta["og:site_name"], "HeapHop");
  assert.match(meta["og:title"], /HeapHop/);
  assert.match(meta["og:description"], /stack, the heap and every pointer/);
  assert.equal(meta["twitter:card"], "summary_large_image");
  assert.match(meta["og:image"], new RegExp(`^${SITE}/opengraph-image\\.png`), "an absolute address, as previews need");
  assert.ok(meta["og:image:alt"]);
  assert.equal(meta["og:image:width"], "1200");
  const image = await fetch(origin() + new URL(meta["og:image"]).pathname + new URL(meta["og:image"]).search);
  assert.equal(image.status, 200, "the picture is public: no login needed");
  assert.equal(image.headers.get("content-type"), "image/png");
  assert.deepEqual(page.errors, []);
  await page.close();
});

test("every page title names the page once, then HeapHop", async () => {
  const page = await newPage({ path: "/supported", ready: "header" });
  assert.equal(await page.title(), "What C++ is supported · HeapHop");
  await page.close();
});
