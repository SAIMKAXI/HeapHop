// Webview check. Proves the interface works where the VS Code extension will
// put it: a page with a strict Content-Security-Policy and no network.
//
//   npm run build && npm run webview:check
//
// It loads dist/standalone/index.html in headless Chrome, runs a linked-list program
// through the Worker, steps through it, and fails on any security-policy violation,
// page error, or request to anything but the local test server.
import { buildStandalone } from "./build-standalone.mjs";
import { clickRun, launchBrowser, serveStatic, setEditorCode } from "./browser.mjs";

const PROGRAM = `#include <iostream>
using namespace std;
struct Node { int data; Node* next; };
int main() {
    Node* head = new Node();
    head->data = 1;
    head->next = new Node();
    head->next->data = 2;
    head->next->next = NULL;
    Node* cur = head;
    while (cur != NULL) { cout << cur->data << " "; cur = cur->next; }
    return 0;
}`;

function fail(message) {
  console.error(`webview check FAILED: ${message}`);
  process.exit(1);
}

let browser;
try {
  browser = await launchBrowser();
} catch (e) {
  fail(e.message);
}
const built = await buildStandalone();
const server = await serveStatic(built.outDir);
const { origin } = server;
const problems = [];
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });

  // No network: anything that is not our own three files is refused and recorded.
  await page.setRequestInterception(true);
  page.on("request", (request) => {
    const url = request.url();
    if (url.startsWith(origin) || url.startsWith("blob:") || url.startsWith("data:")) request.continue();
    else { problems.push(`network request to ${url}`); request.abort(); }
  });
  page.on("pageerror", (e) => problems.push(`page error: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") problems.push(`console error: ${m.text()}`); });
  await page.evaluateOnNewDocument(() => {
    window.__violations = [];
    document.addEventListener("securitypolicyviolation", (e) => window.__violations.push(`${e.violatedDirective} blocked ${e.blockedURI || "inline"}`));
  });

  await page.goto(origin, { waitUntil: "load" });
  await page.waitForSelector("textarea[data-code-input]", { timeout: 10000 });
  await setEditorCode(page, PROGRAM);
  await clickRun(page);

  // Step to the end and look at the picture.
  let maxNodes = 0, maxArrows = 0;
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press("ArrowRight");
    const seen = await page.evaluate(() => ({
      nodes: document.querySelectorAll(".hh-node").length,
      arrows: document.querySelectorAll("[data-arrow-id]").length,
    }));
    maxNodes = Math.max(maxNodes, seen.nodes);
    maxArrows = Math.max(maxArrows, seen.arrows);
  }
  const kind = await page.evaluate(() => document.querySelector("[data-list-kind]")?.textContent ?? "");
  const workers = page.workers().length;
  const violations = await page.evaluate(() => window.__violations);

  if (maxNodes !== 2) problems.push(`expected 2 nodes on the canvas, saw ${maxNodes}`);
  if (maxArrows < 1) problems.push("no arrow was drawn between the nodes");
  if (workers < 1) problems.push("the program did not run in a Worker");
  for (const v of violations) problems.push(`security policy violation: ${v}`);

  if (problems.length === 0) {
    console.log("webview check passed");
    console.log(`  policy: ${built.policy}`);
    console.log(`  bundle: main.js ${(built.sizes["main.js"] / 1024).toFixed(0)} KB, main.css ${(built.sizes["main.css"] / 1024).toFixed(0)} KB`);
    console.log(`  ran in a Worker (${workers}), drew ${maxNodes} nodes and ${maxArrows} arrow(s)${kind ? `, recognised "${kind}"` : ""}, 0 policy violations, 0 outside requests`);
  }
} catch (e) {
  problems.push(e instanceof Error ? e.message : String(e));
} finally {
  await browser.close();
  await server.close();
}
if (problems.length > 0) fail(`\n  - ${[...new Set(problems)].join("\n  - ")}`);
