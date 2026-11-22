import { test } from "node:test";
import assert from "node:assert/strict";
import { accountReference, isReference, reviewIssueUrl } from "../../src/server/reference";

const SECRET = "test-secret-for-references";

test("a reference code is short, fixed for an email (any capitals), and different for another email", async () => {
  const a = await accountReference(SECRET, "zara@heaphop.test");
  assert.match(a, /^HH-[0-9A-F]{4}-[0-9A-F]{4}$/);
  assert.equal(await accountReference(SECRET, "  Zara@HeapHop.test "), a);
  assert.notEqual(await accountReference(SECRET, "other@heaphop.test"), a);
  assert.notEqual(await accountReference("another-secret", "zara@heaphop.test"), a, "it depends on the secret, so nobody can make one from an email");
  assert.ok(!a.toLowerCase().includes("zara"));
});

test("only well-formed codes are accepted from an address bar", () => {
  assert.ok(isReference("HH-7F3A-91C2"));
  for (const bad of ["", "HH-7F3A", "hh-7f3a-91c2", "HH-7F3A-91C2<script>", "HH-GGGG-0000", null, undefined, ["HH-7F3A-91C2"]]) assert.equal(isReference(bad), false, String(bad));
});

test("the review request opens GitHub's new-issue form with the code and no personal details", () => {
  const url = new URL(reviewIssueUrl("HH-7F3A-91C2"));
  assert.equal(url.origin + url.pathname, "https://github.com/SAIMKAXI/HeapHop/issues/new");
  assert.match(url.searchParams.get("title")!, /HH-7F3A-91C2/);
  const body = url.searchParams.get("body")!;
  assert.match(body, /Reference code: HH-7F3A-91C2/);
  assert.match(body, /public/i);
  assert.doesNotMatch(body, /@/, "no email address in the request");
  assert.doesNotMatch(new URL(reviewIssueUrl(null)).searchParams.get("body")!, /Reference code/);
});
