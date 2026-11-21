// One browser, one Next.js server and one fake Supabase for a test file.
// Run `npm run build` first; `npm run e2e` does both.
import { after, before } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createServer } from "node:net";
import { join } from "node:path";
import { clickRun, launchBrowser, setEditorCode } from "../../scripts/browser.mjs";
import { startFakeSupabase } from "./fake-supabase.mjs";

const ROOT = join(import.meta.dirname, "..", "..");
const FIXTURES = join(import.meta.dirname, "..", "fixtures");

export const fixture = (name) => readFileSync(join(FIXTURES, name), "utf8");

export const STUDENT = { email: "student@heaphop.test", password: "Student-Pass-42", fullName: "Test Student", university: "Air University" };
export const ADMIN = { email: "admin@heaphop.test", password: "Admin-Pass-4242", fullName: "Dev Admin", university: "Air University", role: "admin" };

const freePort = () => new Promise((resolve) => {
  const s = createServer();
  s.listen(0, "127.0.0.1", () => { const { port } = s.address(); s.close(() => resolve(port)); });
});

/** Starts `next start` against the fake Supabase. The origin is http://localhost so Secure cookies work. */
export async function startSite(supabase) {
  assert.ok(existsSync(join(ROOT, ".next", "BUILD_ID")), ".next/ is missing: run `npm run build` first");
  const port = await freePort();
  const child = spawn(join(ROOT, "node_modules", ".bin", "next"), ["start", "-p", String(port), "-H", "localhost"], {
    cwd: ROOT,
    env: { ...process.env, SUPABASE_URL: supabase.origin, SUPABASE_PUBLISHABLE_KEY: "test-publishable-key", RATE_LIMIT_SECRET: "x".repeat(40), NODE_ENV: "production" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.output = "";
  child.stdout.on("data", (d) => (child.output += d));
  child.stderr.on("data", (d) => (child.output += d));
  const origin = `http://localhost:${port}`;
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(origin + "/faq")).ok) return { origin, child, close: () => new Promise((r) => { child.once("exit", r); child.kill(); }) };
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  child.kill();
  throw new Error(`next start did not come up:\n${child.output}`);
}

/** Logs the browser in through the real login form. */
export async function logIn(browser, origin, who = STUDENT) {
  const page = await browser.newPage();
  await page.goto(origin + "/login", { waitUntil: "load" });
  await page.type("#f-email", who.email);
  await page.type("#f-password", who.password);
  await Promise.all([page.waitForNavigation({ waitUntil: "load" }), page.click("[data-login-form] button[type=submit]")]);
  await page.close();
}

/**
 * Sets up the browser for the calling test file and returns helpers bound to it.
 * Every page records page errors and console errors; `newPage` fails the test on any.
 * The browser is logged in as a student unless `loggedIn` is false.
 */
export function setupBrowser({ loggedIn = true } = {}) {
  const ctx = {};
  before(async () => {
    ctx.supabase = await startFakeSupabase();
    await ctx.supabase.addUser(STUDENT);
    await ctx.supabase.addUser(ADMIN);
    ctx.server = await startSite(ctx.supabase);
    ctx.browser = await launchBrowser();
    if (loggedIn) await logIn(ctx.browser, ctx.server.origin);
  });
  after(async () => {
    await ctx.browser?.close();
    await ctx.server?.close();
    await ctx.supabase?.close();
  });

  return {
    /** A fresh page (the editor unless `path` says otherwise), with empty local storage unless `keepStorage`. */
    async newPage({ width = 1440, height = 900, keepStorage = false, path = "/editor", ready = "textarea[data-code-input]" } = {}) {
      const page = await ctx.browser.newPage();
      page.errors = [];
      page.on("pageerror", (e) => page.errors.push(e.message));
      page.on("console", (m) => { if (m.type() === "error") page.errors.push(m.text()); });
      await page.setViewport({ width, height });
      await page.goto(ctx.server.origin + path, { waitUntil: "load" });
      if (!keepStorage) {
        await page.evaluate(() => localStorage.clear());
        await page.reload({ waitUntil: "load" });
      }
      await page.waitForSelector(ready);
      return page;
    },
    origin: () => ctx.server.origin,
    supabase: () => ctx.supabase,
    browser: () => ctx.browser,
    serverOutput: () => ctx.server.child.output,
  };
}

/** Put code (and optional cin input) in the editor and run it. */
export async function runCode(page, code, input) {
  await setEditorCode(page, code);
  if (input !== undefined) {
    await page.waitForSelector("[data-program-input]");
    await page.evaluate((text) => {
      const box = document.querySelector("[data-program-input]");
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call(box, text);
      box.dispatchEvent(new Event("input", { bubbles: true }));
    }, input);
  }
  await clickRun(page);
}

/** What the student sees at the current step, as plain data. */
export function snapshot(page) {
  return page.evaluate(() => {
    const badge = document.querySelector("[data-step]");
    return {
      step: Number(badge?.dataset.step),
      steps: Number(badge?.dataset.steps),
      line: Number(document.querySelector("[data-active-line]")?.dataset.sourceLine ?? 0),
      explanation: document.querySelector("[data-explanation]")?.textContent ?? "",
      nodes: [...document.querySelectorAll(".hh-node")].map((n) => n.dataset.nodeId).sort().join(","),
      arrows: [...document.querySelectorAll("[data-arrow-id]")].map((a) => `${a.dataset.arrowId}:${a.dataset.arrowKind}`).sort().join(","),
      stack: [...document.querySelectorAll("[data-stack-frame]")].map((f) => f.textContent).join("|"),
    };
  });
}

export const stepTo = async (page, target) => {
  for (let guard = 0; guard < 5000; guard++) {
    const { step } = await snapshot(page);
    if (step === target) return;
    await page.keyboard.press(step < target ? "ArrowRight" : "ArrowLeft");
  }
  throw new Error(`could not reach step ${target}`);
};

export const textOf = (page, selector) => page.$eval(selector, (el) => el.textContent ?? "");
