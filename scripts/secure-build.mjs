// Runs after `next build`. Locks down the static site in ./out:
//  - every page gets a Content-Security-Policy <meta> tag whose script-src allows only
//    files from this site plus the exact inline scripts on that page (by SHA-256 hash),
//    so an injected <script> or javascript: URL can never run;
//  - stray source maps are deleted.
// Headers that a <meta> tag cannot carry (frame-ancestors, HSTS...) are in vercel.json.
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const OUT = new URL("../out/", import.meta.url).pathname;

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

/** The policy for one page. Exported so the tests check the same text the build writes. */
export function policyFor(inlineScripts) {
  const hashes = [...new Set(inlineScripts.map((s) => `'sha256-${createHash("sha256").update(s, "utf8").digest("base64")}'`))];
  return [
    "default-src 'self'",
    `script-src 'self' ${hashes.join(" ")}`.trim(),
    // React writes style="" attributes into the pre-rendered HTML; styles cannot run code.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self'",
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "upgrade-insecure-requests",
  ].join("; ");
}

const INLINE = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g;

export function secure(html) {
  if (html.includes('http-equiv="Content-Security-Policy"')) return html;
  const scripts = [...html.matchAll(INLINE)].map((m) => m[1]);
  const meta = `<meta http-equiv="Content-Security-Policy" content="${policyFor(scripts)}"/>`;
  if (!/<head[^>]*>/.test(html)) throw new Error("page has no <head>");
  return html.replace(/<head[^>]*>/, (head) => head + meta);
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  let pages = 0, maps = 0;
  for (const file of walk(OUT)) {
    if (file.endsWith(".map")) { rmSync(file); maps++; continue; }
    if (!file.endsWith(".html")) continue;
    writeFileSync(file, secure(readFileSync(file, "utf8")));
    pages++;
  }
  console.log(`secure-build: CSP on ${pages} pages, ${maps} source maps removed`);
}
