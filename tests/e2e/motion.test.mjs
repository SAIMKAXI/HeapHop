// Motion on the read-only pages: the rolling headline on the landing page, content that
// fades in as it scrolls into view, and both switched off for visitors who ask for less motion.
import { test } from "node:test";
import assert from "node:assert/strict";
import { setupBrowser, textOf } from "./harness.mjs";

const { newPage } = setupBrowser();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const FEATURE_TITLES = ["Rewind anything.", "Read it in plain English.", "Catch the crash.", "Trees that look like trees.", "Click to investigate.", "Your code never leaves your browser."];
const trackX = (page) => page.$eval(".hh-marquee-track", (t) => new DOMMatrix(getComputedStyle(t).transform).m41);

test("the landing headline rolls the feature titles past, pauses on request, and is read once", async () => {
  const page = await newPage({ path: "/", ready: "[data-marquee]" });
  const copies = await page.$$eval(".hh-marquee-track > span", (s) => s.map((x) => x.textContent));
  assert.equal(copies.length, 2, "two copies so the loop has no seam");
  assert.equal(copies[0], copies[1]);
  for (const w of ["Pointers, finally visible.", ...FEATURE_TITLES]) assert.ok(copies[0].includes(w), w);
  assert.equal(await page.$eval("[data-marquee]", (m) => m.getAttribute("aria-hidden")), "true");
  assert.deepEqual(await page.$$eval("h2", (h) => h.map((x) => x.textContent).filter((t) => t.includes("finally"))), ["Pointers, finally visible."]);

  const a = await trackX(page);
  await sleep(600);
  assert.ok((await trackX(page)) < a, "the strip moves left");
  await page.click("[data-marquee-toggle]");
  await page.mouse.move(5, 5); // away from the strip, so hover is not what pauses it
  const b = await trackX(page);
  await sleep(600);
  assert.equal(await trackX(page), b, "the button pauses it");
  assert.equal(await page.$eval("[data-marquee-toggle]", (x) => x.getAttribute("aria-label")), "Play the rolling headline");

  const main = await textOf(page, "main");
  assert.ok(!main.includes("chosen from real first-course lab programs"), "the supported-C++ line is gone");
  assert.ok(!main.includes("No account"), "no claim that there are no accounts");
  assert.deepEqual(page.errors, []);
});

test("content below the fold waits faded and arrives as it scrolls into view", async () => {
  const page = await newPage({ path: "/supported", ready: "main article" });
  await page.waitForFunction(() => document.documentElement.getAttribute("data-reveal") === "live");
  await page.waitForFunction(() => document.querySelector("main article > h1").hasAttribute("data-shown"));
  const last = "main article > div > :last-child";
  assert.equal(await page.$eval(last, (el) => el.hasAttribute("data-shown")), false, "the end of the page has not been revealed yet");
  assert.equal(await page.$eval(last, (el) => getComputedStyle(el).opacity), "0");
  await page.$eval(last, (el) => el.scrollIntoView({ block: "center" }));
  await page.waitForFunction((s) => document.querySelector(s).hasAttribute("data-shown"), {}, last);
  await page.waitForFunction((s) => getComputedStyle(document.querySelector(s)).opacity === "1", {}, last);

  // Learn: the lesson cards in view arrive one after another.
  const learn = await newPage({ path: "/learn", ready: "[data-lesson]" });
  await learn.waitForFunction(() => document.querySelector("[data-topic] li")?.hasAttribute("data-shown"));
  const delays = await learn.$$eval("[data-topic]:first-of-type li", (li) => li.map((x) => x.style.getPropertyValue("--reveal-delay")));
  assert.ok(new Set(delays).size > 1, `cards are staggered: ${delays}`);
  assert.deepEqual([...page.errors, ...learn.errors], []);
});

test("with reduced motion nothing is hidden and the headline stands still", async () => {
  const page = await newPage({ path: "/", ready: "[data-marquee]" });
  await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
  await page.reload({ waitUntil: "load" });
  await page.waitForSelector("[data-marquee]");
  assert.equal(await page.evaluate(() => document.documentElement.hasAttribute("data-reveal")), false);
  assert.equal(await page.$eval("[data-marquee]", (m) => getComputedStyle(m).display), "none");
  assert.equal(await page.$eval("[data-reveal]", (el) => getComputedStyle(el).opacity), "1");
  const heading = await page.$$eval("h2", (h) => h.filter((x) => x.textContent === "Pointers, finally visible.").map((x) => x.getBoundingClientRect().width));
  assert.ok(heading[0] > 100, "the plain heading is shown instead");
  await page.goto(page.url().replace(/\/$/, "/faq"), { waitUntil: "load" });
  assert.deepEqual(await page.$$eval("[data-faq]", (d) => [...new Set(d.map((x) => getComputedStyle(x).opacity))]), ["1"]);
});
