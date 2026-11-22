// 8.9 The landing page shows Byte's assembly loop: the video that matches the theme,
// a still frame before it loads and for visitors who ask for less motion.
import { test } from "node:test";
import assert from "node:assert/strict";
import { setupBrowser } from "./harness.mjs";

const { newPage, origin } = setupBrowser();
const MAX_BYTES = 3 * 1024 * 1024;

test("the hero plays the dark-theme clip: muted, inline, with its still frame as the poster", async () => {
  const page = await newPage({ path: "/", ready: "[data-byte-video]" });
  const video = await page.$eval("[data-byte-video]", (v) => ({
    theme: v.dataset.byteVideo, src: v.getAttribute("src"), poster: v.getAttribute("poster"),
    muted: v.muted, loop: v.loop, autoplay: v.autoplay, inline: v.playsInline,
  }));
  assert.deepEqual(video, { theme: "dark", src: "/media/byte-dark.mp4", poster: "/media/byte-dark.webp", muted: true, loop: false, autoplay: true, inline: true });
  assert.ok(await page.$eval("[data-byte-still='dark']", (i) => getComputedStyle(i).display !== "none"));
  assert.equal(await page.$eval("[data-byte-still='light']", (i) => getComputedStyle(i).display), "none");
  assert.deepEqual(page.errors, []);
  await page.close();
});

test("switching to the light theme swaps in the light loop and its still frame", async () => {
  const page = await newPage({ path: "/", ready: "[data-byte-video]" });
  await page.click("[data-theme-toggle]");
  await page.waitForSelector("[data-byte-video='light']");
  assert.equal(await page.$eval("[data-byte-video]", (v) => v.getAttribute("src")), "/media/byte-light.mp4");
  assert.equal(await page.$$eval("[data-byte-video]", (v) => v.length), 1, "only one video is ever loaded");
  assert.equal(await page.$eval("[data-byte-still='dark']", (i) => getComputedStyle(i).display), "none");
  assert.deepEqual(page.errors, []);
  await page.close();
});

test("with reduced motion turned on, the still frame stays and no video loads", async () => {
  const page = await newPage({ path: "/", ready: "[data-byte-hero]" });
  await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
  await page.reload({ waitUntil: "networkidle0" });
  assert.equal(await page.$("[data-byte-video]"), null);
  assert.ok(await page.$eval("[data-byte-still='dark']", (i) => i.complete && i.naturalWidth === 900));
  await page.close();
});

test("the videos and stills are served from the site itself and stay small", async () => {
  for (const theme of ["dark", "light"]) {
    for (const [ext, type] of [["mp4", "video/mp4"], ["webp", "image/webp"]]) {
      const res = await fetch(`${origin()}/media/byte-${theme}.${ext}`);
      assert.equal(res.status, 200, `byte-${theme}.${ext}`);
      assert.equal(res.headers.get("content-type"), type);
      const size = (await res.arrayBuffer()).byteLength;
      assert.ok(size > 1000 && size < MAX_BYTES, `byte-${theme}.${ext} is ${size} bytes`);
    }
  }
});

test("after each run Byte floats gently for 3 seconds, then the clip plays again", async () => {
  const page = await newPage({ path: "/", ready: "[data-byte-video]" });
  await page.waitForFunction(() => document.querySelector("[data-byte-video]").ended, { timeout: 15000 });
  await new Promise((r) => setTimeout(r, 700));
  const lift = await page.$eval(".hh-byte-float", (f) => ({ resting: f.hasAttribute("data-resting"), y: new DOMMatrix(getComputedStyle(f).transform).m42 }));
  assert.ok(lift.resting, "marked as resting during the pause");
  assert.ok(lift.y < -4, `Byte floats up during the pause (y=${lift.y})`);
  await new Promise((r) => setTimeout(r, 1300));
  assert.ok(await page.$eval("[data-byte-video]", (v) => v.ended || v.paused), "still resting 2 s after the end");
  await page.waitForFunction(() => { const v = document.querySelector("[data-byte-video]"); return !v.paused && v.currentTime > 0.2; }, { timeout: 5000 });
  assert.equal(await page.$eval(".hh-byte-float", (f) => f.hasAttribute("data-resting")), false, "the float stops when the clip plays again");
  assert.equal(await page.$eval("[data-byte-hero] figcaption", (c) => c.textContent), "Byte · takes itself apart so you can see inside");
  assert.deepEqual(page.errors, []);
  await page.close();
});
