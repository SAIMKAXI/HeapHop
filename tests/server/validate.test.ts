// The account forms' input checks and the security policy, as the server applies them.
import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanEmail, cleanName, cleanUniversity, isProtected, isTotpCode, isUuid, passwordProblem, safeNext, validateSignup } from "../../src/server/validate";
import { contentSecurityPolicy, newNonce, SESSION_COOKIE } from "../../src/server/policy";

const form = (o: Record<string, string>) => ({ get: (k: string) => o[k] ?? null });

test("sign-up needs a full name, email, university and a strong, confirmed password", () => {
  const ok = validateSignup(form({ fullName: "  Muhammad   Musa ", email: " Musa@Example.COM ", university: "Air University", password: "Tr1cky-Heap!", confirm: "Tr1cky-Heap!" }));
  assert.deepEqual(ok.errors, {});
  assert.deepEqual(ok.input, { fullName: "Muhammad Musa", email: "musa@example.com", university: "Air University", password: "Tr1cky-Heap!" });
  const bad = validateSignup(form({ fullName: "", email: "nope", university: "x", password: "short", confirm: "other" }));
  assert.deepEqual(Object.keys(bad.errors).sort(), ["confirm", "email", "fullName", "password", "university"]);
});

test("names and universities refuse markup and control characters, but keep real names", () => {
  for (const n of ["Ayesha Siddiqa", "O'Brien", "محمد موسیٰ", "José Ñúñez"]) assert.equal(cleanName(n).error, undefined, n);
  for (const n of ["<script>alert(1)</script>", "Robert'); DROP TABLE profiles;--{}", "a\u0000b", "${7*7}", "x".repeat(81)]) assert.ok(cleanName(n).error, n);
  assert.ok(cleanUniversity("<img src=x onerror=alert(1)>").error);
});

test("emails refuse markup, quotes, backslashes and control characters, but keep normal addresses", () => {
  for (const bad of ['"<b>x</b>"@x.com', "a<script>@x.com", "o'neil@x.com", "a`b@x.com", "a\\b@x.com", "a\u0000b@x.com", 'a"b@x.com', "a@x<y.com"]) {
    assert.ok(cleanEmail(bad).error, bad);
  }
  for (const ok of ["m.saim@gmail.com", "first.last+tag@air.edu.pk", "a_b-c@sub.domain.org"]) assert.equal(cleanEmail(ok).error, undefined, ok);
});

test("emails must be a plausible address of sane length", () => {
  assert.ok(cleanEmail("a@b").error);
  assert.ok(cleanEmail(`${"a".repeat(250)}@x.com`).error);
});

test("passwords: length, variety, and not built from the email or a common word", () => {
  assert.equal(passwordProblem("Tr1cky-Heap!", "musa@x.com"), undefined);
  assert.match(passwordProblem("Ab1!", "")!, /10 characters/);
  assert.match(passwordProblem("alllowercaseletters", "")!, /three/);
  assert.match(passwordProblem("Musa12345!!", "musa@x.com")!, /email/);
  assert.match(passwordProblem("MyPassword99", "")!, /guess/);
  assert.match(passwordProblem("Aa1!".repeat(20), "")!, /72/);
});

test("after login only paths on this site are allowed (no open redirect)", () => {
  assert.equal(safeNext("/editor?x=1"), "/editor?x=1");
  for (const bad of ["https://evil.example", "//evil.example", "/\\evil.example", "javascript:alert(1)", "/login", "/auth/callback", "\n/x", null, "/" + "a".repeat(400)]) {
    assert.equal(safeNext(bad), "/learn", String(bad));
  }
});

test("which pages need an account, and the small format checks", () => {
  for (const p of ["/learn", "/learn/x", "/editor", "/account", "/admin"]) assert.ok(isProtected(p), p);
  for (const p of ["/", "/faq", "/about", "/privacy", "/supported", "/login", "/signup", "/learning"]) assert.ok(!isProtected(p), p);
  assert.ok(isUuid("00000000-0000-0000-0000-00000000000a") && !isUuid("1 or 1=1"));
  assert.ok(isTotpCode("123456") && !isTotpCode("12345a") && !isTotpCode("1234567"));
});

test("session cookies are httpOnly, Secure and SameSite; the CSP allows only this site and this response's nonce", () => {
  assert.deepEqual(SESSION_COOKIE, { httpOnly: true, secure: true, sameSite: "lax", path: "/" });
  const nonce = newNonce();
  assert.notEqual(nonce, newNonce());
  const csp = contentSecurityPolicy(nonce);
  assert.match(csp, new RegExp(`script-src 'self' 'nonce-${nonce.replace(/[+/]/g, "\\$&")}' 'strict-dynamic';`));
  assert.doesNotMatch(csp.split(";").find((d) => d.includes("script-src"))!, /unsafe/);
  assert.doesNotMatch(csp, /unsafe-eval|supabase/);
  assert.match(csp, /connect-src 'self';/);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.doesNotMatch(csp, /hcaptcha|frame-src/);
  assert.match(contentSecurityPolicy("n", { dev: true }), /'unsafe-eval'/);
  // With CAPTCHA on, hCaptcha is allowed to frame, connect and style — nothing else loosens.
  const withCaptcha = contentSecurityPolicy("n", { captcha: true });
  assert.match(withCaptcha, /frame-src https:\/\/hcaptcha\.com https:\/\/\*\.hcaptcha\.com/);
  assert.match(withCaptcha, /connect-src 'self' https:\/\/hcaptcha\.com https:\/\/\*\.hcaptcha\.com/);
  assert.match(withCaptcha, /style-src 'self' 'unsafe-inline' https:\/\/hcaptcha\.com https:\/\/\*\.hcaptcha\.com/);
  assert.doesNotMatch(withCaptcha.split(";").find((d) => d.includes("script-src"))!, /unsafe|hcaptcha/);
});
