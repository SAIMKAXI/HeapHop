// 8.8 The security headers the host sends, and the CSP the build writes into every page.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { policyFor, secure } from "../../scripts/secure-build.mjs";

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

test("the build's policy allows this site's files and the page's own inline scripts by hash, nothing else", () => {
  const html = "<html><head><title>x</title></head><body><script>a()</script><script src=\"/app.js\"></script><script id=\"d\">b()</script></body></html>";
  const out: string = secure(html);
  const policy = out.match(/content="([^"]+)"/)![1];
  const hash = (s: string) => `'sha256-${createHash("sha256").update(s).digest("base64")}'`;
  assert.ok(out.startsWith("<html><head><meta http-equiv=\"Content-Security-Policy\""), "the policy comes before any script");
  assert.ok(policy.includes(hash("a()")) && policy.includes(hash("b()")));
  assert.doesNotMatch(policy, /'unsafe-inline'[^;]*;\s*style|script-src[^;]*unsafe/);
  assert.match(policy, /object-src 'none'/);
  assert.equal(secure(out), out, "running twice changes nothing");
  assert.equal(policyFor([]).includes("script-src 'self';"), true);
});
