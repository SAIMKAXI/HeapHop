import { test } from "node:test";
import assert from "node:assert/strict";
import { entryFromReferrer, planMove, sectionOf } from "../../src/ui/site/nav-history";

const at = (path: string) => new URL(path, "https://heaphop.test");

test("pages belong to a section; sign-in pages and unknown paths are left alone", () => {
  assert.equal(sectionOf("/"), "home");
  assert.equal(sectionOf("/learn"), "learn");
  assert.equal(sectionOf("/learn/linked-lists"), "learn");
  for (const s of ["editor", "about", "faq", "privacy", "supported", "account", "admin"]) assert.equal(sectionOf(`/${s}`), s);
  for (const p of ["/login", "/signup", "/login/mfa", "/forgot-password", "/reset-password", "/auth/callback", "/learning", "/x"]) assert.equal(sectionOf(p), null, p);
});

test("from Home, a main page is a new step that remembers Home is underneath", () => {
  assert.deepEqual(planMove(at("/"), at("/learn"), null), { kind: "assign", url: "/learn", entry: { depth: 0, home: true } });
  assert.deepEqual(planMove(at("/"), at("/"), null), { kind: "ignore" });
});

test("inside a section every page is a step back, one at a time", () => {
  assert.deepEqual(planMove(at("/learn"), at("/learn/heaps"), { depth: 0, home: true }), { kind: "assign", url: "/learn/heaps", entry: { depth: 1, home: true } });
  assert.deepEqual(planMove(at("/learn/heaps"), at("/learn"), { depth: 1, home: true }), { kind: "assign", url: "/learn", entry: { depth: 2, home: true } });
});

test("moving to another main page replaces the current one, so Back goes straight to Home", () => {
  assert.deepEqual(planMove(at("/learn"), at("/editor"), { depth: 0, home: true }), { kind: "replace", url: "/editor", entry: { depth: 0, home: true } });
  assert.deepEqual(planMove(at("/about"), at("/faq"), { depth: 0, home: false }), { kind: "replace", url: "/faq", entry: { depth: 0, home: false } });
  // deep inside Learn: first go back to its first page, then swap that for the Editor
  assert.deepEqual(planMove(at("/learn/heaps?lesson=sift-down"), at("/editor"), { depth: 2, home: true }), { kind: "rewind", steps: 2, url: "/editor", entry: { depth: 0, home: true } });
});

test("the Home link goes back to the Home already in history instead of adding another", () => {
  assert.deepEqual(planMove(at("/faq"), at("/"), { depth: 0, home: true }), { kind: "back", steps: 1 });
  assert.deepEqual(planMove(at("/learn/heaps"), at("/"), { depth: 1, home: true }), { kind: "back", steps: 2 });
  assert.deepEqual(planMove(at("/faq"), at("/"), { depth: 0, home: false }), { kind: "replace", url: "/", entry: { depth: 0, home: false } });
  assert.deepEqual(planMove(at("/faq"), at("/"), null), { kind: "replace", url: "/", entry: { depth: 0, home: false } });
});

test("sign-in pages, the same page and other sites are left to the browser", () => {
  assert.deepEqual(planMove(at("/about"), at("/login"), { depth: 0, home: true }), { kind: "ignore" });
  assert.deepEqual(planMove(at("/login"), at("/learn"), null), { kind: "ignore" });
  assert.deepEqual(planMove(at("/faq"), at("/faq"), { depth: 0, home: true }), { kind: "ignore" });
  assert.deepEqual(planMove(at("/faq"), new URL("https://github.com/x"), { depth: 0, home: true }), { kind: "ignore" });
});

test("a page reached without our help knows Home is underneath only when it came from Home", () => {
  assert.deepEqual(entryFromReferrer("https://heaphop.test/", "https://heaphop.test"), { depth: 0, home: true });
  assert.deepEqual(entryFromReferrer("https://heaphop.test/login", "https://heaphop.test"), { depth: 0, home: false });
  assert.deepEqual(entryFromReferrer("https://evil.test/", "https://heaphop.test"), { depth: 0, home: false });
  assert.deepEqual(entryFromReferrer("", "https://heaphop.test"), { depth: 0, home: false });
});
