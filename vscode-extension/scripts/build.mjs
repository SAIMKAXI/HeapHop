// Builds the extension into the two places VS Code loads from:
//
//   dist/extension.js        the extension itself (runs in VS Code's extension host)
//   media/webview/main.js    the panel, with its Worker embedded as text
//   media/webview/main.css   the panel's stylesheet (Tailwind, from the website's design)
//
// The engine and the interface come straight from ../src, the same code the website runs.
//
//   npm run build            (from this folder)
import { build } from "esbuild";
import pkg from "javascript-obfuscator";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const { obfuscate } = pkg;

const here = join(dirname(fileURLToPath(import.meta.url)), "..");
const repo = join(here, "..");
const webviewOut = join(here, "media", "webview");

// All rights reserved: the shipped bundles are minified (above) and then obfuscated, so the
// code can't be read, copied or rebuilt into another extension. A VS Code extension is JavaScript
// that runs on the user's machine, so this cannot be made impossible to inspect, only costly; the
// source itself is never shipped (see .vscodeignore). Set HEAPHOP_NO_OBFUSCATE=1 for a readable
// dev build. The engine that steps the program runs in the Worker and is left minified-only, so
// stepping stays fast; everything else (the panel and the extension host) is obfuscated.
const SKIP_OBFUSCATION = process.env.HEAPHOP_NO_OBFUSCATE === "1";

function harden(code, { node = false } = {}) {
  if (SKIP_OBFUSCATION) return code;
  return obfuscate(code, {
    // "browser-no-eval" never introduces eval/new Function, which the webview's CSP forbids.
    target: node ? "node" : "browser-no-eval",
    compact: true,
    simplify: true,
    identifierNamesGenerator: "mangled-shuffled",
    renameGlobals: false, // keep acquireVsCodeApi, postMessage, self, module.exports untouched
    transformObjectKeys: false, // keep message-protocol keys intact across the Worker and VS Code
    // Move every string literal into an encoded array, so the labels, messages and the C++
    // keywords the engine matches can't be read out of the file. A run is capped at a few
    // thousand steps, so the per-access decode is never noticeable.
    stringArray: true,
    stringArrayThreshold: 1,
    stringArrayEncoding: ["base64"],
    stringArrayWrappersType: "function",
    stringArrayWrappersCount: 2,
    stringArrayRotate: true,
    stringArrayShuffle: true,
    // These wreck performance or break under VS Code's CSP / extension host, so they stay off.
    controlFlowFlattening: false,
    deadCodeInjection: false,
    debugProtection: false,
    selfDefending: false,
    unicodeEscapeSequence: false,
  }).getObfuscatedCode();
}

export async function buildExtension({ quiet = false } = {}) {
  rmSync(join(here, "dist"), { recursive: true, force: true });
  rmSync(webviewOut, { recursive: true, force: true });
  mkdirSync(webviewOut, { recursive: true });

  // Byte is a website feature: the panel gets an empty stand-in for every robot module.
  const noRobot = {
    name: "no-robot",
    setup(b) {
      b.onResolve({ filter: /^@\/ui\/robot\// }, () => ({ path: join(here, "webview", "no-robot.ts") }));
    },
  };
  const browser = {
    bundle: true, minify: true, platform: "browser", target: "es2023", logLevel: "silent",
    tsconfig: join(here, "tsconfig.json"), jsx: "automatic", legalComments: "none",
    define: { "process.env.NODE_ENV": '"production"' },
    plugins: [noRobot],
  };

  // 1. The Worker: interpreter (with std::list) + message handler. Obfuscated too — a run is
  // capped at a few thousand steps, so hiding its strings (no encoding) costs no real speed.
  const worker = await build({ ...browser, entryPoints: [join(here, "webview", "worker.ts")], format: "iife", write: false });
  const workerSource = harden(worker.outputFiles[0].text);

  // 2. The panel, with the Worker source embedded. The panel bundle is obfuscated; the embedded
  // Worker source stays as it is (minified), so the stepping engine inside it keeps its speed.
  const panel = await build({
    ...browser,
    entryPoints: [join(here, "webview", "main.tsx")],
    format: "iife",
    write: false,
    define: { ...browser.define, __WORKER_SOURCE__: JSON.stringify(workerSource) },
  });
  writeFileSync(join(webviewOut, "main.js"), harden(panel.outputFiles[0].text));

  // 3. The stylesheet: the website's design (globals.css) followed by the panel's own rules.
  // The website leaves this folder out of its Tailwind scan; the panel's build puts it back in.
  const globalsPath = join(repo, "src", "app", "globals.css");
  const globals = readFileSync(globalsPath, "utf8").replace(/^@source not "[^"]*vscode-extension";[^\S\n]*$/m, "");
  const own = readFileSync(join(here, "webview", "styles.css"), "utf8");
  const webviewDir = join(here, "webview").replace(/\\/g, "/");
  const source = `${globals}\n@source "${webviewDir}";\n${own}`;
  const css = await postcss([tailwind({ base: repo, optimize: { minify: true } })]).process(source, { from: globalsPath });
  // Fonts are VS Code's own; the website's font files are not shipped.
  writeFileSync(join(webviewOut, "main.css"), css.css.replace(/@font-face\s*\{[^}]*\}/g, ""));

  // 4. The extension host side.
  const host = await build({
    entryPoints: [join(here, "src", "extension.ts")],
    bundle: true, minify: true, platform: "node", target: "node18", format: "cjs", logLevel: "silent",
    external: ["vscode"], write: false, legalComments: "none",
  });
  mkdirSync(join(here, "dist"), { recursive: true });
  writeFileSync(join(here, "dist", "extension.js"), harden(host.outputFiles[0].text, { node: true }));

  const size = (f) => readFileSync(f).length;
  const sizes = {
    "dist/extension.js": size(join(here, "dist", "extension.js")),
    "media/webview/main.js": size(join(webviewOut, "main.js")),
    "media/webview/main.css": size(join(webviewOut, "main.css")),
  };
  if (!quiet) {
    console.log("HeapHop extension built:");
    for (const [f, n] of Object.entries(sizes)) console.log(`  ${f.padEnd(24)} ${(n / 1024).toFixed(0)} KB`);
    console.log(`  (the panel's Worker is ${(workerSource.length / 1024).toFixed(0)} KB of main.js)`);
  }
  return { webviewOut, sizes };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await buildExtension();
}
