// The security headers the host sends on every path. The per-request CSP with a nonce
// is written by src/proxy.ts and tested in tests/server and tests/e2e.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("Vercel builds the site as a Next.js app (accounts need the server), not a static folder", () => {
  const config = JSON.parse(readFileSync("vercel.json", "utf8"));
  for (const key of ["framework", "outputDirectory", "cleanUrls"]) assert.equal(config[key], undefined, key);
  assert.doesNotMatch(readFileSync("next.config.ts", "utf8"), /output:\s*"export"/);
});

test("vercel.json sends the hardening headers on every path", () => {
  const config = JSON.parse(readFileSync("vercel.json", "utf8"));
  const all = config.headers.find((h: { source: string }) => h.source === "/(.*)");
  const get = (key: string) => all.headers.find((h: { key: string }) => h.key === key)?.value ?? "";
  assert.match(get("Content-Security-Policy"), /frame-ancestors 'none'/);
  assert.equal(get("X-Frame-Options"), "DENY");
  assert.equal(get("X-Content-Type-Options"), "nosniff");
  assert.match(get("Strict-Transport-Security"), /max-age=\d{8}/);
  assert.match(get("Permissions-Policy"), /camera=\(\).*microphone=\(\).*geolocation=\(\)/);
  assert.equal(get("Cross-Origin-Opener-Policy"), "same-origin");
  assert.ok(get("Referrer-Policy"));
});

test("no Supabase address, key or secret is ever exposed to the browser", () => {
  for (const file of ["next.config.ts", "src/server/supabase.ts", "src/proxy.ts", "src/server/rate-limit.ts"]) {
    assert.doesNotMatch(readFileSync(file, "utf8"), /process\.env\.NEXT_PUBLIC_/, file);
  }
});
