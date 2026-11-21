// 8.10 Accounts: sign-up, login, the login gate, MFA, the admin page, and the security rules
// around them, through the real Next.js server (Supabase is replaced by a local fake).
import { test } from "node:test";
import assert from "node:assert/strict";
import { ADMIN, STUDENT, setupBrowser } from "./harness.mjs";
import { totp } from "./fake-supabase.mjs";

const env = setupBrowser({ loggedIn: false });
const origin = () => env.origin();

/** A fresh, separate browser profile: its own cookies and storage. */
async function freshPage(path = "/") {
  const context = await env.browser().createBrowserContext();
  const page = await context.newPage();
  page.errors = [];
  page.on("pageerror", (e) => page.errors.push(e.message));
  page.close = ((orig) => async () => { await orig.call(page); await context.close(); })(page.close);
  await page.goto(origin() + path, { waitUntil: "load" });
  return page;
}

async function submitLogin(page, who, next) {
  await page.goto(origin() + (next ? `/login?next=${encodeURIComponent(next)}` : "/login"), { waitUntil: "load" });
  await page.type("#f-email", who.email);
  await page.type("#f-password", who.password);
  // Either the server sends us on to another page, or the form shows a message.
  await page.click("[data-login-form] button[type=submit]");
  await page.waitForFunction(() => location.pathname !== "/login" || document.querySelector("[data-banner='error']"), { timeout: 15000 });
  await page.waitForNetworkIdle({ idleTime: 150 }).catch(() => {});
}

const path = (page) => new URL(page.url()).pathname + new URL(page.url()).search;

test("without an account, Learn, the editor, the account and admin pages send you to log in; the rest stay open", async () => {
  const page = await freshPage();
  for (const p of ["/learn", "/editor", "/account", "/admin", "/learn?lesson=bubble-sort"]) {
    await page.goto(origin() + p, { waitUntil: "load" });
    assert.equal(new URL(page.url()).pathname, "/login", p);
    assert.equal(new URL(page.url()).searchParams.get("next"), p, p);
  }
  for (const p of ["/", "/faq", "/about", "/privacy", "/supported"]) {
    const res = await page.goto(origin() + p, { waitUntil: "load" });
    assert.equal(res.status(), 200, p);
    assert.equal(new URL(page.url()).pathname, p, p);
  }
  assert.ok(await page.$("[data-login-link]") && await page.$("[data-signup-link]"));
  await page.close();
});

test("sign-up checks every field on the server, then asks you to confirm your email before you can log in", async () => {
  const page = await freshPage("/signup");
  await page.type("#f-fullName", "<script>x</script>");
  await page.type("#f-email", "not-an-email");
  await page.type("#f-university", "A");
  await page.type("#f-password", "short");
  await page.type("#f-confirm", "different");
  await page.click("[data-signup-form] button[type=submit]");
  await page.waitForSelector("[data-field-error='password']");
  const errors = await page.$$eval("[data-field-error]", (els) => els.map((e) => e.dataset.fieldError).sort());
  assert.deepEqual(errors, ["confirm", "email", "fullName", "password", "university"]);
  assert.equal(await page.$eval("#f-fullName", (i) => i.value), "<script>x</script>", "what you typed is kept, as text");
  assert.equal((await env.supabase().state()).users.length, 2, "nothing reached Supabase");

  const who = { email: "new.student@heaphop.test", password: "Fresh-Heap-91", fullName: "Ayesha Siddiqa", university: "NUST" };
  await page.goto(origin() + "/signup", { waitUntil: "load" });
  for (const [id, v] of [["fullName", who.fullName], ["email", who.email], ["university", who.university], ["password", who.password], ["confirm", who.password]]) await page.type(`#f-${id}`, v);
  await page.click("[data-signup-form] button[type=submit]");
  await page.waitForSelector("[data-banner='ok']");
  assert.match(await page.$eval("[data-banner='ok']", (e) => e.textContent), /sent a link/);
  const state = await env.supabase().state();
  assert.deepEqual(state.profiles.find((p) => p.email === who.email), { ...state.profiles.find((p) => p.email === who.email), full_name: "Ayesha Siddiqa", university: "NUST", role: "student" });

  await submitLogin(page, who);
  assert.match(await page.$eval("[data-banner='error']", (e) => e.textContent), /Confirm your email/);
  await env.supabase().confirm(who.email);
  await submitLogin(page, who, "/editor");
  assert.equal(new URL(page.url()).pathname, "/editor");
  assert.match(await page.$eval("[data-account-link]", (e) => e.textContent), /Ayesha/);
  assert.deepEqual(page.errors, []);
  await page.close();
});

test("the session lives only in httpOnly, Secure, SameSite cookies: page scripts can't read a token anywhere", async () => {
  const page = await freshPage();
  await submitLogin(page, STUDENT);
  const cookies = await page.browserContext().cookies();
  const auth = cookies.filter((c) => c.name.startsWith("sb-"));
  assert.ok(auth.length > 0, "a session cookie is set");
  for (const c of auth) {
    assert.equal(c.httpOnly, true, c.name);
    assert.equal(c.secure, true, c.name);
    assert.equal(c.sameSite, "Lax", c.name);
  }
  const visible = await page.evaluate(() => ({ cookie: document.cookie, local: JSON.stringify(localStorage), session: JSON.stringify(sessionStorage) }));
  for (const [where, text] of Object.entries(visible)) {
    assert.doesNotMatch(text, /sb-|access_token|refresh_token|eyJ/, `${where} has no token`);
  }
  const html = await page.content();
  assert.doesNotMatch(html, /access_token|refresh_token|test-publishable-key|127\.0\.0\.1:\d+/, "no token, key or Supabase address in the page");
  await page.close();
});

test("a wrong password gets one plain message, and repeated guesses are rate-limited", async () => {
  const page = await freshPage();
  const target = { email: "victim@heaphop.test", password: "Victim-Pass-77", fullName: "Victim", university: "Air University" };
  await env.supabase().addUser(target);
  await submitLogin(page, { email: target.email, password: "wrong-guess-1" });
  assert.equal(await page.$eval("[data-banner='error']", (e) => e.textContent), "Email or password is wrong.");
  await submitLogin(page, { email: "nobody@heaphop.test", password: "wrong-guess-1" });
  assert.equal(await page.$eval("[data-banner='error']", (e) => e.textContent), "Email or password is wrong.", "same answer for an unknown email");
  for (let i = 0; i < 8; i++) await submitLogin(page, { email: target.email, password: `wrong-guess-${i}` });
  assert.match(await page.$eval("[data-banner='error']", (e) => e.textContent), /Too many attempts/);
  await submitLogin(page, target);
  assert.match(await page.$eval("[data-banner='error']", (e) => e.textContent), /Too many attempts/, "even the right password waits");
  await env.supabase().resetLimits();
  await page.close();
});

test("after logging in you only ever go to a page on this site (no open redirect)", async () => {
  const page = await freshPage();
  await submitLogin(page, STUDENT, "https://evil.example/steal");
  assert.equal(new URL(page.url()).origin, origin());
  assert.equal(new URL(page.url()).pathname, "/learn");
  await page.close();
});

test("log out works from the header, and a log-out request from another site is refused (CSRF)", async () => {
  const forged = await fetch(origin() + "/auth/logout", { method: "POST", headers: { origin: "https://evil.example" }, redirect: "manual" });
  assert.equal(forged.status, 403);
  const page = await freshPage();
  await submitLogin(page, STUDENT);
  await Promise.all([page.waitForNavigation({ waitUntil: "load" }), page.click("[data-logout]")]);
  assert.equal(new URL(page.url()).pathname, "/");
  await page.goto(origin() + "/learn", { waitUntil: "load" });
  assert.equal(new URL(page.url()).pathname, "/login");
  await page.close();
});

test("MFA: set it up with an authenticator code, then every login asks for a fresh code", async () => {
  const who = { email: "mfa.user@heaphop.test", password: "Mfa-Heap-Pass-5", fullName: "Mfa User", university: "FAST" };
  await env.supabase().addUser(who);
  const page = await freshPage();
  await submitLogin(page, who, "/account");
  assert.equal(new URL(page.url()).pathname, "/account");
  await page.click("[data-mfa-start]");
  await page.waitForSelector("[data-mfa-qr]");
  const secret = await page.$eval("[data-account-mfa] code", (c) => c.textContent);
  await page.type("[data-account-mfa] #f-code", "000000");
  await page.click("[data-account-mfa] button[type=submit]");
  await page.waitForSelector("[data-field-error='code']");
  await page.$eval("[data-account-mfa] #f-code", (i) => (i.value = ""));
  await page.type("[data-account-mfa] #f-code", totp(secret));
  await page.click("[data-account-mfa] button[type=submit]");
  await page.waitForFunction(() => document.querySelector("[data-account-mfa] [data-banner='ok']")?.textContent.includes("MFA is on"));

  await Promise.all([page.waitForNavigation({ waitUntil: "load" }), page.click("[data-logout]")]);
  await submitLogin(page, who, "/editor");
  assert.equal(new URL(page.url()).pathname, "/login/mfa", "the password alone is not enough");
  await page.goto(origin() + "/editor", { waitUntil: "load" });
  assert.equal(new URL(page.url()).pathname, "/login/mfa", "the gate holds until the code is entered");
  await page.type("#f-code", totp(secret));
  await Promise.all([page.waitForNavigation({ waitUntil: "load" }), page.click("[data-mfa-form] button[type=submit]")]);
  assert.equal(new URL(page.url()).pathname, "/editor");
  await page.close();
});

test("the admin sees users and counts and can disable an account; the disabled user is shut out at once", async () => {
  const victim = { email: "to.disable@heaphop.test", password: "Disable-Me-123", fullName: "Zara Disabled", university: "COMSATS" };
  await env.supabase().addUser(victim);
  const student = await freshPage();
  await submitLogin(student, victim);
  assert.equal(new URL(student.url()).pathname, "/learn");
  await student.goto(origin() + "/admin", { waitUntil: "load" });
  assert.equal(new URL(student.url()).pathname, "/learn", "students can't open the admin page");

  const admin = await freshPage();
  await submitLogin(admin, ADMIN, "/admin");
  assert.equal(new URL(admin.url()).pathname, "/admin");
  assert.ok(await admin.$("[data-admin-link]"));
  const stats = await admin.$eval("[data-admin-stats]", (e) => e.textContent);
  assert.match(stats, /Users\d+/);
  assert.ok(await admin.$(`[data-user-row="${victim.email}"]`));
  assert.match(await admin.$eval("[data-admin-users]", (e) => e.textContent), /COMSATS/);
  await admin.click(`[data-user-row="${victim.email}"] button`);
  await admin.waitForFunction((email) => document.querySelector(`[data-user-row="${email}"]`)?.textContent.includes("Disabled"), {}, victim.email);

  await student.goto(origin() + "/editor", { waitUntil: "load" });
  assert.equal(path(student), "/login?disabled=1", "the open session is ended");
  await submitLogin(student, victim);
  assert.match(await student.$eval("[data-banner='error']", (e) => e.textContent), /disabled/);
  await student.close();
  await admin.close();
});

test("the server logs never contain a password, an email or a token", async () => {
  const out = env.serverOutput();
  for (const secret of [STUDENT.password, ADMIN.password, STUDENT.email, "access_token", "refresh_token", "eyJ"]) {
    assert.ok(!out.includes(secret), `server output contains ${secret}`);
  }
});
