// Data stays data: text that looks like SQL is stored and shown exactly as typed, and text
// that looks like markup is refused, through the real sign-up form, admin page and account form.
// The database side (CHECK constraints, no dynamic SQL) is covered by
// tests/server/injection-guards.test.ts and the migrations.
import { test } from "node:test";
import assert from "node:assert/strict";
import { ADMIN, setupBrowser } from "./harness.mjs";

const env = setupBrowser({ loggedIn: false });
const origin = () => env.origin();

async function freshPage(path) {
  const context = await env.browser().createBrowserContext();
  const page = await context.newPage();
  page.errors = [];
  page.dialogs = [];
  page.on("pageerror", (e) => page.errors.push(e.message));
  page.on("dialog", async (d) => { page.dialogs.push(d.message()); await d.dismiss(); });
  page.close = ((orig) => async () => { await orig.call(page); await context.close(); })(page.close);
  await page.goto(origin() + path, { waitUntil: "load" });
  return page;
}
async function fillSignup(page, v) {
  for (const [id, value] of Object.entries(v)) await page.type(`#f-${id}`, value);
  await page.click("[data-signup-form] button[type=submit]");
}

const SQL_NAME = "Robert'); DROP TABLE profiles;--";
const SQL_UNI = "x' OR '1'='1";

test("text that looks like SQL is saved and shown exactly as typed, never run", async () => {
  await env.supabase().resetLimits();
  const page = await freshPage("/signup");
  await fillSignup(page, { fullName: SQL_NAME, email: "bobby@heaphop.test", university: SQL_UNI, password: "Fresh-Heap-91", confirm: "Fresh-Heap-91" });
  await page.waitForSelector("[data-banner='ok']");
  await page.close();
  const state = await env.supabase().state();
  const row = state.profiles.find((p) => p.email === "bobby@heaphop.test");
  assert.equal(row.full_name, SQL_NAME);
  assert.equal(row.university, SQL_UNI);
  assert.equal(state.profiles.filter((p) => p.role === "admin").length, 1, "nobody became admin");

  const admin = await freshPage("/login?next=%2Fadmin");
  await admin.type("#f-email", ADMIN.email);
  await admin.type("#f-password", ADMIN.password);
  await Promise.all([admin.waitForNavigation({ waitUntil: "load" }), admin.click("[data-login-form] button[type=submit]")]);
  const cells = await admin.$$eval("[data-user-row='bobby@heaphop.test'] td", (td) => td.slice(0, 3).map((c) => ({ text: c.textContent, tags: c.querySelectorAll("*").length })));
  assert.deepEqual(cells.map((c) => c.text), [SQL_NAME, "bobby@heaphop.test", SQL_UNI], "shown as plain text");
  assert.ok(await admin.$(`[data-review-row="${SQL_UNI}"]`), "listed for review as text");
  assert.deepEqual([...admin.errors, ...admin.dialogs], []);
  await admin.close();
});

test("text that looks like markup or code is refused before it reaches the database", async () => {
  await env.supabase().resetLimits();
  const before = (await env.supabase().state()).users.length;
  const page = await freshPage("/signup");
  await fillSignup(page, {
    fullName: "<img src=x onerror=alert(1)>", email: '"<b>x</b>"@heaphop.test', university: "<script>alert(1)</script>",
    password: "Fresh-Heap-91", confirm: "Fresh-Heap-91",
  });
  await page.waitForSelector("[data-field-error='email']");
  const errors = await page.$$eval("[data-field-error]", (e) => e.map((x) => x.dataset.fieldError).sort());
  assert.deepEqual(errors, ["email", "fullName", "university"]);
  assert.equal(await page.$("img[src='x']"), null, "the typed markup never becomes an element");
  assert.equal(await page.$eval("#f-fullName", (i) => i.value), "<img src=x onerror=alert(1)>", "kept in the field as text");
  assert.equal((await env.supabase().state()).users.length, before, "nothing reached Supabase");
  assert.deepEqual([...page.errors, ...page.dialogs], []);
  await page.close();
});
