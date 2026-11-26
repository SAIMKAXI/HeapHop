// Show / hide password on the login and sign-up forms.
import { test } from "node:test";
import assert from "node:assert/strict";
import { setupBrowser } from "./harness.mjs";

const { newPage } = setupBrowser({ loggedIn: false });
const state = (page, name) => page.evaluate((n) => {
  const i = document.querySelector(`#f-${n}`);
  const b = document.querySelector(`[data-password-toggle='${n}']`);
  return { type: i.type, value: i.value, pressed: b.getAttribute("aria-pressed"), label: b.getAttribute("aria-label") };
}, name);

test("login: the eye button shows and hides the password without changing it, and sending the form hides it", async () => {
  const page = await newPage({ path: "/login", ready: "[data-password-toggle='password']" });
  await page.type("#f-password", "Fresh-Heap-91");
  assert.deepEqual(await state(page, "password"), { type: "password", value: "Fresh-Heap-91", pressed: "false", label: "Show password" });
  await page.click("[data-password-toggle='password']");
  assert.deepEqual(await state(page, "password"), { type: "text", value: "Fresh-Heap-91", pressed: "true", label: "Hide password" });
  await page.click("[data-password-toggle='password']");
  assert.equal((await state(page, "password")).type, "password");

  await page.click("[data-password-toggle='password']");
  await page.type("#f-email", "nobody@heaphop.test");
  await page.click("[data-login-form] button[type=submit]");
  await page.waitForSelector("[data-banner]");
  assert.equal((await state(page, "password")).type, "password", "hidden again after sending");
  assert.deepEqual(page.errors, []);
});

test("sign-up: password and confirm each have their own eye button", async () => {
  const page = await newPage({ path: "/signup", ready: "[data-password-toggle='confirm']" });
  await page.type("#f-password", "Fresh-Heap-91");
  await page.type("#f-confirm", "Fresh-Heap-91");
  await page.click("[data-password-toggle='confirm']");
  assert.equal((await state(page, "confirm")).type, "text");
  assert.equal((await state(page, "password")).type, "password", "the other field stays hidden");
  assert.equal((await state(page, "confirm")).label, "Hide confirm password");
  assert.deepEqual(page.errors, []);
});
