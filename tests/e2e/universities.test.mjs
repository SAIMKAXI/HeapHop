// 8.13 One name per university: the searchable list on sign-up and Account settings, the
// database matching every spelling of a listed university to its name, and the admin
// merging or adding the spellings that match nothing (which then match future sign-ups too).
import { test } from "node:test";
import assert from "node:assert/strict";
import { ADMIN, STUDENT, setupBrowser } from "./harness.mjs";

const env = setupBrowser({ loggedIn: false });
const origin = () => env.origin();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function freshPage(path = "/") {
  const context = await env.browser().createBrowserContext();
  const page = await context.newPage();
  page.errors = [];
  page.on("pageerror", (e) => page.errors.push(e.message));
  page.close = ((orig) => async () => { await orig.call(page); await context.close(); })(page.close);
  await page.goto(origin() + path, { waitUntil: "load" });
  return page;
}
async function logInAs(who, next) {
  const page = await freshPage(next ? `/login?next=${encodeURIComponent(next)}` : "/login");
  await page.type("#f-email", who.email);
  await page.type("#f-password", who.password);
  await Promise.all([page.waitForNavigation({ waitUntil: "load" }), page.click("[data-login-form] button[type=submit]")]);
  return page;
}
async function signUp(fullName, email, university) {
  await env.supabase().resetLimits(); // this file signs up more accounts than one address may per hour
  const page = await freshPage("/signup");
  for (const [id, v] of [["fullName", fullName], ["email", email], ["university", university], ["password", "Fresh-Heap-91"], ["confirm", "Fresh-Heap-91"]]) await page.type(`#f-${id}`, v);
  await page.click("[data-signup-form] button[type=submit]");
  await page.waitForSelector("[data-banner='ok']");
  await page.close();
  return (await env.supabase().state()).profiles.find((p) => p.email === email);
}
const options = (page) => page.$$eval("[data-university-option]", (o) => o.map((x) => x.dataset.universityOption));

test("sign-up: the university field searches the HEC list by name or short form, and says what will be saved", async () => {
  const page = await freshPage("/signup");
  await page.type("#f-university", "air");
  await page.waitForSelector("[data-university-option]");
  assert.equal((await options(page))[0], "Air University");
  await page.$eval("#f-university", (i) => i.select());
  await page.type("#f-university", "fast");
  await page.waitForFunction(() => document.querySelector("[data-university-option]")?.dataset.universityOption === "National University of Computer & Emerging Sciences");
  assert.match(await page.$eval("[data-university-hint]", (h) => h.textContent), /Saved as National University of Computer & Emerging Sciences/);

  // Arrow keys and Enter pick a suggestion.
  await page.$eval("#f-university", (i) => i.select());
  await page.type("#f-university", "lahore univ");
  await page.waitForSelector("[data-university-option]");
  await page.keyboard.press("ArrowDown");
  assert.equal(await page.$eval("#f-university", (i) => i.getAttribute("aria-activedescendant")?.endsWith("-opt-0")), true);
  const first = (await options(page))[0];
  await page.keyboard.press("Enter");
  assert.equal(await page.$eval("#f-university", (i) => i.value), first);
  assert.equal(await page.$("[role=listbox]"), null, "the list closes after picking");

  // A university that is not listed can still be typed.
  await page.$eval("#f-university", (i) => i.select());
  await page.type("#f-university", "Hogwarts Uni");
  await page.waitForSelector("[data-university-unlisted]");
  assert.match(await page.$eval("[data-university-unlisted]", (o) => o.textContent), /Hogwarts Uni.*isn.t listed/);
  assert.match(await page.$eval("[data-university-hint]", (h) => h.textContent), /Not in the list yet/);
  assert.deepEqual(page.errors, []);
  await page.close();
});

test("every spelling of a listed university is saved as its listed name, even without picking", async () => {
  for (const [i, typed] of ["air university", "Air", "AirUni", "AU"].entries()) {
    const p = await signUp("Air Student", `air${i}@heaphop.test`, typed);
    assert.equal(p.university, "Air University", typed);
    assert.ok(p.university_id > 0, typed);
  }
  const unlisted = await signUp("Hogwarts Student", "hogwarts@heaphop.test", "Hogwarts Uni");
  assert.equal(unlisted.university, "Hogwarts Uni", "an unlisted university is kept as typed");
  assert.equal(unlisted.university_id, null);
});

test("the admin merges or adds the names that matched nothing, and later sign-ups with them are matched", async () => {
  await signUp("Campus Student", "campus@heaphop.test", "Air Univ Islamabad Campus");
  const admin = await logInAs(ADMIN, "/admin");
  assert.equal(new URL(admin.url()).pathname, "/admin");
  const reviewRows = () => admin.$$eval("[data-review-row]", (r) => r.map((x) => x.dataset.reviewRow));
  assert.deepEqual((await reviewRows()).sort(), ["Air Univ Islamabad Campus", "Hogwarts Uni"]);
  const counts = await admin.$$eval("[data-university-count]", (r) => r.map((x) => x.textContent.replace(/\s+/g, " ").trim()));
  assert.ok(counts.some((c) => /^Air University\s*\d+$/.test(c) && Number(c.match(/\d+$/)[0]) >= 4), `Air University counted once: ${counts}`);
  assert.ok(counts.some((c) => c.includes("Hogwarts Uni") && c.includes("not listed")));

  // Merge "Air Univ Islamabad Campus" into Air University using the picker.
  const row = "[data-review-row='Air Univ Islamabad Campus']";
  await admin.type(`${row} [data-merge-form] input[role=combobox]`, "air");
  await admin.waitForSelector(`${row} [data-university-option='Air University']`);
  await admin.click(`${row} [data-university-option='Air University']`);
  await admin.click(`${row} [data-merge-form] button[type=submit]`);
  await admin.waitForSelector("[data-admin-review] [data-banner]");
  assert.match(await admin.$eval("[data-admin-review] [data-banner]", (b) => b.textContent), /Merged/);
  await admin.waitForFunction(() => !document.querySelector("[data-review-row='Air Univ Islamabad Campus']"));
  let state = await env.supabase().state();
  assert.equal(state.profiles.find((p) => p.email === "campus@heaphop.test").university, "Air University");

  // Add "Hogwarts Uni" as a new university, with a tidier name.
  const hog = "[data-review-row='Hogwarts Uni']";
  await admin.$eval(`${hog} [data-add-form] input[name=name]`, (i) => { i.value = ""; });
  await admin.type(`${hog} [data-add-form] input[name=name]`, "Hogwarts University");
  await admin.click(`${hog} [data-add-form] button[type=submit]`);
  await admin.waitForSelector("[data-review-empty]");
  state = await env.supabase().state();
  assert.equal(state.profiles.find((p) => p.email === "hogwarts@heaphop.test").university, "Hogwarts University");
  assert.deepEqual(admin.errors, []);
  await admin.close();

  // The merged spelling and the new university now match on their own.
  assert.equal((await signUp("Later Student", "later@heaphop.test", "air univ islamabad campus")).university, "Air University");
  assert.equal((await signUp("Wizard", "wizard@heaphop.test", "hogwarts")).university, "Hogwarts University");
  const picker = await freshPage("/signup");
  await picker.type("#f-university", "hogw");
  await picker.waitForSelector("[data-university-option='Hogwarts University']");
  await picker.close();
});

test("Account settings use the same picker, and save the listed name", async () => {
  const page = await logInAs(STUDENT, "/account");
  assert.equal(new URL(page.url()).pathname, "/account");
  await page.$eval("#f-university", (i) => i.select());
  await page.type("#f-university", "nust");
  await page.keyboard.press("Escape"); // the suggestion list sits over the button
  await page.click("[data-account-profile] button[type=submit]");
  await page.waitForSelector("[data-account-profile] [data-banner='ok']");
  await sleep(100);
  assert.equal(await page.$eval("#f-university", (i) => i.value), "National University of Sciences & Technology");
  const p = (await env.supabase().state()).profiles.find((x) => x.email === STUDENT.email);
  assert.equal(p.university, "National University of Sciences & Technology");
  assert.deepEqual(page.errors, []);
  await page.close();
});
