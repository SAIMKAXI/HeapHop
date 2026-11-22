import { test } from "node:test";
import assert from "node:assert/strict";
import { EXAMPLES } from "../../content/examples";
import { LESSONS } from "../../content/lessons";
import { TOPICS, topicBySlug, lessonsOf, examplesOf } from "../../src/ui/learn/topics";

test("nine topics, in course order, each with a page address", () => {
  assert.deepEqual(TOPICS.map((t) => t.slug), ["sorting", "linked-lists", "doubly-linked-lists", "stacks", "queues", "binary-search-trees", "avl-trees", "heaps", "graphs"]);
  for (const t of TOPICS) {
    assert.equal(topicBySlug(t.slug), t);
    assert.match(t.slug, /^[a-z-]+$/);
    assert.ok(t.short.length <= 90, `${t.slug}: the card text stays short`);
  }
  assert.equal(topicBySlug("nope"), undefined);
  assert.equal(topicBySlug("__proto__"), undefined);
});

test("every lesson and every example program is on exactly one topic page", () => {
  const lessons = TOPICS.flatMap((t) => lessonsOf(t).map((l) => l.id));
  assert.deepEqual([...lessons].sort(), LESSONS.map((l) => l.id).sort());
  const examples = TOPICS.flatMap((t) => examplesOf(t).flatMap((g) => g.examples.map((e) => e.id)));
  assert.deepEqual([...examples].sort(), EXAMPLES.map((e) => e.id).sort());
  assert.equal(new Set(examples).size, examples.length);
  const doubly = examplesOf(topicBySlug("doubly-linked-lists")!).flatMap((g) => g.examples.map((e) => e.id));
  assert.deepEqual(doubly, ["doubly", "circular"]);
});
