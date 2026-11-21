// 8.8 The site defends itself: a Content-Security-Policy on every page that blocks
// injected scripts, lesson code that cannot be edited, and hostile input shown as text.
import { test } from "node:test";
import assert from "node:assert/strict";
import { runCode, setupBrowser, textOf } from "./harness.mjs";

const { newPage } = setupBrowser();
const PAGES = ["/", "/learn", "/editor", "/faq", "/about", "/privacy", "/supported", "/learn?lesson=array-stack"];

/** Counts CSP violations from the very start of every page load. */
async function watchViolations(page) {
  await page.evaluateOnNewDocument(() => {
    window.__violations = [];
    document.addEventListener("securitypolicyviolation", (e) => window.__violations.push(`${e.violatedDirective} ${e.blockedURI}`));
  });
}

test("every page carries a strict Content-Security-Policy with a fresh nonce, and loads without breaking it", async () => {
  const nonces = new Set();
  for (const path of [...PAGES, "/login", "/signup", "/account"]) {
    const page = await newPage({ path, ready: "header" });
    await watchViolations(page);
    const res = await page.reload({ waitUntil: "networkidle0" });
    const policy = res.headers()["content-security-policy"] ?? "";
    assert.match(policy, /default-src 'self'/, path);
    assert.match(policy, /object-src 'none'/, path);
    assert.match(policy, /base-uri 'none'/, path);
    assert.match(policy, /frame-ancestors 'none'/, path);
    assert.match(policy, /connect-src 'self';/, `${path}: the browser only talks to this site`);
    const script = policy.split(";").find((d) => d.trim().startsWith("script-src"));
    assert.doesNotMatch(script, /unsafe/, `${path}: no unsafe scripts`);
    const nonce = script.match(/'nonce-([^']+)'/)?.[1];
    assert.ok(nonce, path);
    nonces.add(nonce);
    assert.equal(await page.$eval("head script:not([src])", (s) => s.nonce), nonce, `${path}: the theme script carries the nonce`);
    assert.deepEqual(await page.evaluate(() => window.__violations), [], path);
    assert.deepEqual(page.errors, [], path);
    await page.close();
  }
  assert.equal(nonces.size, PAGES.length + 3, "every response gets its own nonce");
});

test("injected markup cannot run script: inline handlers and scripts without the nonce are blocked", async () => {
  // What an XSS bug would inject is markup: a <script> tag in the HTML or an onerror="..." handler.
  const page = await newPage({ path: "/", ready: "header" });
  await watchViolations(page);
  await page.reload({ waitUntil: "networkidle0" });
  await page.evaluate(() => {
    const frame = document.createElement("iframe");
    frame.srcdoc = "<script>parent.__pwned = true</" + "script><a href=\"javascript:parent.__pwned=true\" id=j>x</a>";
    document.body.append(frame);
    const img = document.createElement("img");
    img.setAttribute("src", "x");
    img.setAttribute("onerror", "window.__pwned = true");
    document.body.append(img);
  });
  await new Promise((r) => setTimeout(r, 500));
  await page.evaluate(() => document.querySelector("iframe")?.contentDocument?.getElementById("j")?.click());
  await new Promise((r) => setTimeout(r, 300));
  assert.equal(await page.evaluate(() => window.__pwned), undefined, "the injected code did not run");
  assert.ok((await page.evaluate(() => window.__violations)).some((v) => v.startsWith("script-src")), "the browser reported the block");
  await page.close();
});

test("lesson code is read-only: no edit box, and typing changes nothing", async () => {
  const page = await newPage({ path: "/learn?lesson=array-stack", ready: "[data-lesson-card]" });
  const editable = await page.$$eval("textarea, input:not([type=range]):not([type=checkbox]), [contenteditable='true'], [contenteditable='']", (els) => els.length);
  assert.equal(editable, 0, "nothing on a lesson page accepts typed code");
  const code = () => page.$$eval("[data-source-line]", (lines) => lines.map((l) => l.textContent).join("\n"));
  const before = await code();
  await page.click("[data-source-line='36']").catch(() => {});
  await page.keyboard.type("system(\"rm -rf /\");");
  await page.keyboard.press("Backspace");
  assert.ok(before.includes("class A_Stack"));
  assert.equal(await code(), before);
  assert.deepEqual(page.errors, []);
  await page.close();
});

test("a lesson address with script in it shows the lesson list, and runs nothing", async () => {
  const page = await newPage({ path: "/learn?lesson=%3Cimg%20src%3Dx%20onerror%3Dwindow.__pwned%3D1%3E", ready: "header" });
  await new Promise((r) => setTimeout(r, 500));
  assert.equal(await page.evaluate(() => window.__pwned), undefined);
  assert.equal(await page.$("img[src='x']"), null, "the address is never turned into HTML");
  await page.close();
});

test("a program that prints HTML shows it as plain text", async () => {
  const page = await newPage();
  await runCode(page, `#include <iostream>
using namespace std;
int main() {
    cout << "<img src=x onerror=alert(1)><b>bold</b>";
    return 0;
}`);
  await page.click("button[title='Go to last step']");
  await page.waitForFunction(() => document.querySelector("[data-output]")?.textContent.includes("<b>"), { timeout: 5000 });
  assert.equal(await textOf(page, "[data-output]"), "<img src=x onerror=alert(1)><b>bold</b>");
  assert.equal(await page.$("[data-output] img, [data-output] b"), null);
  assert.deepEqual(page.errors, []);
  await page.close();
});
