// Builds the interface as a standalone page in dist/standalone:
//   main.js     the interface, with the Worker script embedded as text
//   main.css    the stylesheet produced by `next build` (fonts removed)
//   index.html  a page with the strict security policy a VS Code webview uses
//
// Run `npm run build` first: the stylesheet is taken from its output.
import { build } from "esbuild";
import { mkdirSync, readdirSync, readFileSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "dist", "standalone");

export async function buildStandalone() {
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  const common = {
    bundle: true, minify: true, platform: "browser", target: "es2023", logLevel: "silent",
    tsconfig: join(root, "tsconfig.json"), jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' },
  };

  // 1. The Worker: interpreter + message handler.
  const worker = await build({ ...common, entryPoints: [join(root, "src/runtime/worker.ts")], format: "iife", write: false });
  const workerSource = worker.outputFiles[0].text;

  // 2. The interface, with the Worker source embedded.
  await build({
    ...common,
    entryPoints: [join(root, "src/standalone/main.tsx")],
    format: "iife",
    outfile: join(outDir, "main.js"),
    define: { ...common.define, __WORKER_SOURCE__: JSON.stringify(workerSource) },
  });

  // 3. Styles from the Next build. Font files are not shipped here, so drop @font-face.
  const cssDir = join(root, "out", "_next", "static");
  if (!existsSync(cssDir)) throw new Error("out/ is missing. Run `npm run build` before the standalone build.");
  const cssFiles = readdirSync(cssDir, { recursive: true }).filter((f) => String(f).endsWith(".css"));
  if (cssFiles.length === 0) throw new Error("No stylesheet found in out/_next/static.");
  const css = cssFiles.map((f) => readFileSync(join(cssDir, String(f)), "utf8")).join("\n").replace(/@font-face\s*\{[^}]*\}/g, "");
  writeFileSync(join(outDir, "main.css"), css);

  // 4. The page, locked down like a VS Code webview: nothing loads unless listed.
  const nonce = randomBytes(16).toString("base64");
  const policy = [
    "default-src 'none'",
    `script-src 'nonce-${nonce}'`,
    "style-src 'self'",
    "worker-src blob:",
    "img-src data:",
  ].join("; ");
  writeFileSync(join(outDir, "index.html"), `<!DOCTYPE html>
<html lang="en" class="dark">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${policy}">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>HeapHop</title>
<link rel="stylesheet" href="main.css">
</head>
<body class="antialiased">
<div id="root"></div>
<script nonce="${nonce}" src="main.js"></script>
</body>
</html>
`);
  const size = (f) => readFileSync(join(outDir, f)).length;
  return { outDir, policy, sizes: { "main.js": size("main.js"), "main.css": size("main.css") }, workerBytes: workerSource.length };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const r = await buildStandalone();
  console.log(`standalone build -> ${r.outDir}`);
  console.log(`  main.js ${(r.sizes["main.js"] / 1024).toFixed(0)} KB (includes the ${(r.workerBytes / 1024).toFixed(0)} KB worker), main.css ${(r.sizes["main.css"] / 1024).toFixed(0)} KB`);
}
