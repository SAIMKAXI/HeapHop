// The extension's own logic, without VS Code: messages, Problems entries, the panel page,
// and the manifest VS Code reads.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { run } from "@/core/interpreter";
import { isFromPanel } from "../src/protocol";
import { isCppDocument, panelHtml, problemsFor } from "../src/logic";
import { summarize } from "../webview/summary";

const root = join(__dirname, "..");
const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const STL = { extended: true };

// ---- messages from the panel are checked ---------------------------------------

test("well-formed panel messages are accepted", () => {
  for (const m of [
    { type: "ready" },
    { type: "rerun" },
    { type: "step", runId: 3, line: 7, callerLine: null, error: false },
    { type: "step", runId: 3, line: 7, callerLine: 12, error: true },
    { type: "result", runId: 1, summary: { ok: true, status: "completed", steps: 40 } },
    { type: "result", runId: 1, summary: { ok: false, kind: "parse", message: "Line 3: oops", line: 3 } },
    { type: "input", text: "4\n1 2 3 4" },
    { type: "reveal", line: 5 },
  ]) assert.ok(isFromPanel(m), JSON.stringify(m));
});

test("malformed or unknown panel messages are dropped", () => {
  for (const m of [
    null, "ready", 42, {}, { type: "run" }, { type: "openFile", path: "/etc/passwd" },
    { type: "step", runId: "3", line: 7, callerLine: null, error: false },
    { type: "step", runId: 3, line: -1, callerLine: null, error: false },
    { type: "reveal", line: 0 },
    { type: "reveal", line: 1.5 },
    { type: "input", text: "x".repeat(20_001) },
    { type: "result", runId: 1, summary: { ok: true, status: "exploded", steps: 1 } },
    { type: "result", runId: 1, summary: { ok: false, kind: "parse", message: 5 } },
  ]) assert.ok(!isFromPanel(m), JSON.stringify(m));
});

// ---- what goes into the Problems panel -----------------------------------------

test("code HeapHop cannot run is an error on its line", () => {
  const r = run("#include <iostream>\n#include <unordered_map>\nusing namespace std;\nint main() {\n  unordered_map<int, int> m;\n}", undefined, "", STL);
  const [p] = problemsFor(summarize(r), null);
  assert.equal(p.line, 5);
  assert.equal(p.severity, "error");
  assert.match(p.message, /^HeapHop: "unordered_map<\.\.\.>"/);
  assert.doesNotMatch(p.message, /Line 5:/, "the line number is not repeated: the squiggle is on it");
});

test("a crash is a warning on the crash line, with the reason", () => {
  const r = run("#include <list>\nusing namespace std;\nint main() {\n  list<int> a;\n  a.pop_front();\n  return 0;\n}", undefined, "", STL);
  const s = summarize(r);
  assert.equal(s.ok && s.errorLine, 5);
  const [p] = problemsFor(s, null);
  assert.equal(p.line, 5);
  assert.equal(p.severity, "warning");
  assert.match(p.message, /stops here\. a\.pop_front\(\) is called on an empty list/);
});

test("a run cut short is an information note on the last line it reached", () => {
  const r = run("int main() {\n  int i = 0;\n  while (true) {\n    i++;\n  }\n}", undefined, "", STL);
  const s = summarize(r);
  const [p] = problemsFor(s, null);
  assert.equal(p.severity, "information");
  assert.ok(p.line === 3 || p.line === 4, `line ${p.line}`);
});

test("a program that runs to the end leaves no problems; a cancelled run changes nothing", () => {
  const r = run("int main() { int x = 1; return 0; }", undefined, "", STL);
  assert.deepEqual(problemsFor(summarize(r), 1), []);
  assert.deepEqual(problemsFor({ ok: false, kind: "cancelled", message: "A newer run replaced this one." }, null), []);
});

// ---- files and the page ----------------------------------------------------------

test("C++ files are recognised by language or by name", () => {
  assert.ok(isCppDocument("cpp", "/x/a.txt"));
  assert.ok(isCppDocument("plaintext", "/x/main.cpp"));
  assert.ok(isCppDocument("plaintext", "C:\\labs\\lab3.CC"));
  assert.ok(!isCppDocument("python", "/x/main.py"));
  assert.ok(!isCppDocument("markdown", "/x/README.md"));
});

test("the panel page loads nothing but its own files and a blob Worker", () => {
  const html = panelHtml({ cspSource: "https://file+.vscode-resource.vscode-cdn.net", nonce: "abc123", scriptUri: "S", styleUri: "C" });
  const policy = /content="([^"]+)"/.exec(html)![1];
  assert.match(policy, /default-src 'none'/);
  assert.match(policy, /script-src 'nonce-abc123'(;|$)/);
  assert.match(policy, /worker-src blob:/);
  assert.doesNotMatch(policy, /unsafe-inline|unsafe-eval|\*/);
  assert.match(html, /<script nonce="abc123" src="S">/);
  assert.equal((html.match(/<script/g) ?? []).length, 1, "exactly one script, the extension's own");
});

// ---- the manifest ------------------------------------------------------------------

test("every command in a menu or key binding exists, and has a title", () => {
  const commands = new Set(manifest.contributes.commands.map((c: { command: string; title: string }) => {
    assert.ok(c.title);
    return c.command;
  }));
  const used = [
    ...Object.values(manifest.contributes.menus).flat().map((m) => (m as { command: string }).command),
    ...manifest.contributes.keybindings.map((k: { command: string }) => k.command),
  ];
  for (const c of used) assert.ok(commands.has(c), `${c} is used but not declared`);
});

test("the colours, icons and settings the code uses are declared and shipped", () => {
  const source = readFileSync(join(root, "src", "extension.ts"), "utf8");
  const colors = new Set(manifest.contributes.colors.map((c: { id: string }) => c.id));
  for (const [, id] of source.matchAll(/ThemeColor\("(heaphop\.[\w.]+)"\)/g)) assert.ok(colors.has(id), `colour ${id} is not declared`);
  for (const [, name] of source.matchAll(/icon\("([\w.-]+)"\)/g)) assert.ok(existsSync(join(root, "media", name)), `media/${name} is missing`);
  assert.ok(existsSync(join(root, manifest.icon)), "the Marketplace icon is missing");
  const settings = Object.keys(manifest.contributes.configuration.properties);
  for (const [, name] of source.matchAll(/setting\("(\w+)"/g)) assert.ok(settings.includes(`heaphop.${name}`), `setting heaphop.${name} is not declared`);
});

test("the VS Code API types are not newer than the VS Code versions the extension claims to support", () => {
  const types = JSON.parse(readFileSync(join(root, "node_modules", "@types", "vscode", "package.json"), "utf8")).version;
  const engine = manifest.engines.vscode.replace(/^\^/, "");
  const [ta, tb] = types.split(".").map(Number);
  const [ea, eb] = engine.split(".").map(Number);
  assert.ok(ta < ea || (ta === ea && tb <= eb), `@types/vscode ${types} is newer than engines.vscode ${engine}`);
});

test("the package ships the built files and keeps sources and tests out", () => {
  const ignore = readFileSync(join(root, ".vscodeignore"), "utf8").split(/\r?\n/);
  for (const pattern of ["src/**", "webview/**", "scripts/**", "test/**", "node_modules/**"]) assert.ok(ignore.includes(pattern), `${pattern} should be ignored`);
  assert.equal(manifest.main, "./dist/extension.js");
});
