// Panel check: the HeapHop panel, exactly as built for VS Code, in headless Chrome.
//
//   npm run build && npm run webview:check        (from this folder)
//
// The page is the one the extension gives VS Code (same security policy, same files), with
// a stand-in for VS Code's webview API that records every message. It runs std::list and
// plain-pointer programs, steps through them, and checks the messages that drive the editor
// (current line, problems, program input, reveal). It fails on any policy violation, page
// error or request to anything but the local test server, and saves screenshots of the
// panel at the sizes a VS Code panel usually has.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { launchBrowser, serveStatic } from "../../scripts/browser.mjs";
import { panelHtml } from "../src/logic.ts";
import { buildExtension } from "./build.mjs";

const here = join(dirname(fileURLToPath(import.meta.url)), "..");
const shots = join(here, "test", "screenshots");
const fixture = (name: string) => readFileSync(join(here, "..", "tests", "fixtures", "stl", name), "utf8");

const POINTERS = `#include <iostream>
using namespace std;
struct Node { int data; Node* next; Node(int d) : data(d), next(nullptr) {} };
void push(Node*& head, int v) { Node* n = new Node(v); n->next = head; head = n; }
int main() {
    Node* head = nullptr;
    push(head, 3);
    push(head, 2);
    push(head, 1);
    for (Node* p = head; p != nullptr; p = p->next) cout << p->data << " ";
    while (head) { Node* t = head; head = head->next; delete t; }
    return 0;
}`;

const CRASH = `#include <iostream>
#include <list>
using namespace std;
int main() {
    list<int> nums = {1, 2, 3};
    list<int>::iterator it = nums.begin();
    nums.erase(it);
    cout << *it << endl;
    return 0;
}`;

const UNSUPPORTED = `#include <iostream>
#include <unordered_map>
using namespace std;
int main() {
    unordered_map<int, int> m;
    return 0;
}`;

const extFixture = (name: string) => readFileSync(join(here, "..", "tests", "fixtures", "ext", name), "utf8");

type Posted = { type: string; [key: string]: unknown };

function fail(message: string): never {
  console.error(`panel check FAILED: ${message}`);
  process.exit(1);
}

async function main() {
  const built = await buildExtension({ quiet: true });
  // A stylesheet standing in for the colour variables VS Code puts on every webview.
  writeFileSync(join(built.webviewOut, "vscode-vars.css"), `html { --vscode-editor-background: #1f1f1f; --vscode-font-family: system-ui; --vscode-editor-font-family: monospace; }
html.light { --vscode-editor-background: #ffffff; }`);
  const server = await serveStatic(built.webviewOut);
  const { origin } = server;
  const html = panelHtml({ cspSource: origin, nonce: "testnonce123", scriptUri: `${origin}/main.js`, styleUri: `${origin}/main.css` })
    .replace('<link rel="stylesheet"', `<link rel="stylesheet" href="${origin}/vscode-vars.css">\n<link rel="stylesheet"`)
    .replace('<body class="antialiased">', '<body class="antialiased vscode-dark">');
  writeFileSync(join(built.webviewOut, "panel.html"), html);

  mkdirSync(shots, { recursive: true });
  const browser = await launchBrowser();
  const problems: string[] = [];
  const checks: string[] = [];
  const ok = (what: string) => checks.push(what);
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 720, height: 900 });
    await page.setRequestInterception(true);
    page.on("request", (request: { url(): string; continue(): void; abort(): void }) => {
      const url = request.url();
      if (url.startsWith(origin) || url.startsWith("blob:") || url.startsWith("data:")) request.continue();
      else { problems.push(`network request to ${url}`); request.abort(); }
    });
    page.on("pageerror", (e: Error) => problems.push(`page error: ${e.message}`));
    page.on("console", (m: { type(): string; text(): string }) => {
      if (m.type() === "error" && !/Failed to load resource/.test(m.text())) problems.push(`console error: ${m.text()}`);
    });
    page.on("response", (r: { status(): number; url(): string }) => {
      if (r.status() >= 400 && !r.url().endsWith("/favicon.ico")) problems.push(`HTTP ${r.status()} for ${r.url()}`);
    });
    // The script runner names functions with a helper; functions sent into the page need it too.
    await page.evaluateOnNewDocument("globalThis.__name = (f) => f;");
    await page.evaluateOnNewDocument(() => {
      const w = window as unknown as Record<string, unknown>;
      w.__violations = [];
      w.__posted = [];
      w.__state = undefined;
      document.addEventListener("securitypolicyviolation", (e) => (w.__violations as string[]).push(`${e.violatedDirective} blocked ${e.blockedURI || "inline"}`));
      w.acquireVsCodeApi = () => ({
        postMessage: (m: unknown) => (w.__posted as unknown[]).push(m),
        getState: () => w.__state,
        setState: (s: unknown) => { w.__state = s; },
      });
    });

    const posted = (): Promise<Posted[]> => page.evaluate(() => (window as unknown as { __posted: Posted[] }).__posted);
    const waitFor = async (pred: (all: Posted[]) => boolean, what: string) => {
      for (let i = 0; i < 100; i++) {
        if (pred(await posted())) return;
        await new Promise((r) => setTimeout(r, 100));
      }
      throw new Error(`timed out waiting for ${what}`);
    };
    let runId = 0;
    const run = async (code: string, fileName: string, input = "") => {
      runId++;
      await page.evaluate((m: unknown) => window.postMessage(m, "*"), { type: "run", runId, code, input, fileName, fileUri: `file:///work/${fileName}` });
      await waitFor((all) => all.some((m) => m.type === "result" && m.runId === runId), `the result of run ${runId}`);
      return (await posted()).filter((m) => m.type === "result" && m.runId === runId).pop()!.summary as Record<string, unknown>;
    };
    const stepTo = async (n: number) => {
      for (let i = 0; i < n; i++) await page.keyboard.press("ArrowRight");
    };
    /** Let the canvas finish its slide animations before a screenshot. */
    const settle = () => new Promise((r) => setTimeout(r, 900));
    const count = (selector: string): Promise<number> => page.evaluate((s: string) => document.querySelectorAll(s).length, selector);

    await page.goto(`${origin}/panel.html`, { waitUntil: "load" });
    await waitFor((all) => all.some((m) => m.type === "ready"), "the panel to say it is ready");
    ok("the panel loads and tells VS Code it is ready");

    // 1. std::list: nodes, arrows, iterator; editor line messages; no Byte, no site, no code panel.
    const s1 = await run(fixture("02_iterators.cpp"), "iterators.cpp");
    if (s1.ok !== true || s1.status !== "completed") problems.push(`std::list run did not complete: ${JSON.stringify(s1)}`);
    await page.waitForSelector(".hh-canvas", { timeout: 10000 });
    let maxNodes = 0, maxArrows = 0;
    const lines = new Set<number>();
    for (let i = 0; i < 25; i++) {
      await stepTo(1);
      maxNodes = Math.max(maxNodes, await count(".hh-node"));
      maxArrows = Math.max(maxArrows, await count("[data-arrow-id]"));
    }
    for (const m of await posted()) if (m.type === "step" && m.runId === runId) lines.add(m.line as number);
    if (maxNodes < 6) problems.push(`expected the 6 list nodes on the canvas, saw ${maxNodes}`);
    if (maxArrows < 6) problems.push(`expected arrows between list nodes, saw ${maxArrows}`);
    if (lines.size < 4) problems.push(`expected step messages for several lines, got ${[...lines].join(", ")}`);
    const kind = await page.evaluate(() => document.querySelector("[data-list-kind]")?.textContent ?? "");
    ok(`std::list: ${maxNodes} nodes and ${maxArrows} arrows drawn${kind ? ` (recognised "${kind}")` : ""}; editor told about lines ${[...lines].sort((a, b) => a - b).join(", ")}`);
    if (await count("[data-robot], [data-robot-toggle]")) problems.push("Byte (or his button) is in the panel");
    if (await count('[data-panel="code"], [data-view-tab]')) problems.push("the code panel is shown, but the code belongs in the editor");
    if (await count('a[href="/learn"], a[href*="login"], [data-profile-menu]')) problems.push("website navigation (Learn / login) is in the panel");
    const fileName = await page.evaluate(() => document.querySelector("[data-file-name]")?.textContent);
    if (fileName !== "iterators.cpp") problems.push(`header shows "${fileName}" instead of the file name`);
    ok("no Byte, no code panel, no website header or login; the header names the file");
    const state = await page.evaluate(() => (window as unknown as { __state: { uri?: string } }).__state);
    if (state?.uri !== "file:///work/iterators.cpp") problems.push("the panel did not remember its file for a VS Code restart");
    await settle();
    await page.screenshot({ path: join(shots, "1-list-side-panel.png") });

    // The editor's cursor line marks the steps that ran it.
    await page.evaluate(() => window.postMessage({ type: "focusLine", line: 8 }, "*"));
    await new Promise((r) => setTimeout(r, 200));
    const marks = await count("[data-timeline-mark]");
    if (marks < 6) problems.push(`cursor on line 8 should mark its steps on the timeline, saw ${marks} marks`);
    ok(`cursor on a line marks the ${marks} steps that ran it`);

    // Re-running the same file keeps the step the student was on.
    const before = await page.evaluate(() => document.querySelector("[data-step]")?.getAttribute("data-step"));
    await run(fixture("02_iterators.cpp"), "iterators.cpp");
    await new Promise((r) => setTimeout(r, 200));
    const after = await page.evaluate(() => document.querySelector("[data-step]")?.getAttribute("data-step"));
    if (before !== after) problems.push(`a re-run moved the student from step ${before} to ${after}`);
    ok(`re-run on save stays on step ${after}`);

    // 2. A graph BFS (array of lists, class, new[]): wide panel.
    await page.setViewport({ width: 1280, height: 800 });
    const s2 = await run(fixture("03_graph_bfs.cpp"), "graph.cpp");
    if (s2.status !== "completed") problems.push("the BFS program did not complete");
    await stepTo(40);
    await settle();
    await page.screenshot({ path: join(shots, "2-graph-wide.png") });
    ok("an array of lists (graph BFS) runs and draws");

    // 3. Plain pointers, as on the website, in a short wide panel and in the light theme.
    await page.setViewport({ width: 960, height: 460 });
    await run(POINTERS, "pointers.cpp");
    await stepTo(12);
    await settle();
    await page.screenshot({ path: join(shots, "3-pointers-short.png") });
    await page.evaluate(() => { document.body.classList.remove("vscode-dark"); document.body.classList.add("vscode-light"); });
    await new Promise((r) => setTimeout(r, 300));
    const light = await page.evaluate(() => document.documentElement.classList.contains("light"));
    if (!light) problems.push("the panel did not follow VS Code to the light theme");
    await page.setViewport({ width: 720, height: 900 });
    await settle();
    await page.screenshot({ path: join(shots, "4-pointers-light.png") });
    ok("follows VS Code's light / dark theme");

    // 4. Program input for cin: the box opens, typing is saved, Run again asks VS Code for a fresh run.
    await run(fixture("08_cin_queue.cpp"), "queue.cpp", "");
    const boxOpen = await count("[data-program-input]");
    if (!boxOpen) problems.push("the program reads cin but the input box did not open");
    await page.type("[data-program-input]", "2 7 9");
    await page.click("[data-rerun]");
    await waitFor((all) => all.some((m) => m.type === "rerun"), "Run again");
    const inputs = (await posted()).filter((m) => m.type === "input");
    if (inputs[inputs.length - 1]?.text !== "2 7 9") problems.push(`the typed input was not sent to VS Code (${JSON.stringify(inputs.pop())})`);
    const s4 = await run(fixture("08_cin_queue.cpp"), "queue.cpp", "2 7 9");
    if (s4.status !== "completed") problems.push("the cin program did not complete with its input");
    ok("program input box: opens for cin, sends what is typed, Run again asks for a new run");
    await page.click("[data-input-toggle]"); // close it again for the next screenshots

    // 5. A crash: the error step, its line for the editor.
    await page.evaluate(() => { document.body.classList.remove("vscode-light"); document.body.classList.add("vscode-dark"); });
    const s5 = await run(CRASH, "crash.cpp");
    if (s5.status !== "error" || s5.errorLine !== 8 || !/erased on line 7/.test(String(s5.errorMessage))) problems.push(`crash summary is wrong: ${JSON.stringify(s5)}`);
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await stepTo(20);
    await new Promise((r) => setTimeout(r, 200));
    const lastStep = (await posted()).filter((m) => m.type === "step" && m.runId === runId).pop();
    if (!lastStep?.error || lastStep.line !== 8) problems.push(`the crash step was not reported on line 8: ${JSON.stringify(lastStep)}`);
    await settle();
    await page.screenshot({ path: join(shots, "5-crash.png") });
    ok("a crash (iterator used after erase) is reported on its line, for the editor and the Problems panel");

    // 6. Unsupported code: an error card with a button to the line.
    const s6 = await run(UNSUPPORTED, "vector.cpp");
    if (s6.ok !== false || s6.line !== 5) problems.push(`unsupported-code summary is wrong: ${JSON.stringify(s6)}`);
    await page.waitForSelector("[data-run-error]");
    await page.click("[data-reveal-line]");
    await waitFor((all) => all.some((m) => m.type === "reveal" && m.line === 5), "the reveal message");
    await settle();
    await page.screenshot({ path: join(shots, "6-unsupported.png") });
    ok("unsupported code shows a readable card, and its button reveals the line in the editor");

    // 7. The larger C++ of the extension: vectors as a graph, a nested-class AVL tree, heaps.
    await page.setViewport({ width: 1280, height: 860 });
    const shotsOf: [string, string, number][] = [
      ["e14_graphs.cpp", "7-vector-graph.png", 118],
      ["e05_avl_nested.cpp", "8-avl-nested-class.png", 420],
      ["e11_stack_queue.cpp", "9-priority-queue.png", 146],
      ["e12_map_set_pair.cpp", "10-map.png", 45],
    ];
    for (const [file, shot, at] of shotsOf) {
      const s = await run(extFixture(file), file);
      if (s.status !== "completed") problems.push(`${file} did not complete: ${JSON.stringify(s)}`);
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
      await page.keyboard.press("Home");
      await stepTo(at);
      await settle();
      await page.screenshot({ path: join(shots, shot) });
    }
    ok("vectors, a nested-class AVL tree, priority queues and maps run and draw");

    const workers = page.workers().length;
    if (workers < 1) problems.push("programs did not run in a Worker");
    const violations = await page.evaluate(() => (window as unknown as { __violations: string[] }).__violations);
    for (const v of violations) problems.push(`security policy violation: ${v}`);
    ok(`ran in a Worker; ${violations.length} security-policy violations; no outside requests`);
  } catch (e) {
    problems.push(e instanceof Error ? e.message : String(e));
  } finally {
    await browser.close();
    await server.close();
  }
  if (problems.length > 0) fail(`\n  - ${[...new Set(problems)].join("\n  - ")}`);
  console.log("panel check passed");
  for (const c of checks) console.log(`  ✓ ${c}`);
  console.log(`  screenshots: ${shots}`);
}

void main();
