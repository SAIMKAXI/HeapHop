import { test } from "node:test";
import assert from "node:assert/strict";
import { curAt, HOP, REST } from "../../src/ui/auth/heap-scene-timing";

const N = 5;

test("cur starts on head, rests on each node in turn, and the node it rests on is the one that glows", () => {
  const seen: number[] = [];
  for (let t = 0; t < N * HOP; t += 0.05) {
    const s = curAt(t, N);
    if (s.glowing >= 0) {
      assert.equal(s.progress, 0, `t=${t.toFixed(2)}: glowing only while cur stands still`);
      assert.equal(s.glowing, s.from, `t=${t.toFixed(2)}: the glowing node is the node cur is on`);
      if (seen.at(-1) !== s.glowing) seen.push(s.glowing);
    }
  }
  assert.deepEqual(seen, [0, 1, 2, 3, 4], "every node, head first, in order");
});

test("between nodes cur moves forward and nothing glows; after the last node it starts again at head", () => {
  const mid = curAt(REST * HOP + 0.01, N);
  assert.equal(mid.glowing, -1);
  assert.ok(mid.progress > 0 && mid.progress < 1);
  assert.equal(mid.to, mid.from + 1);
  const last = curAt((N - 1) * HOP + HOP * 0.9, N);
  assert.equal(last.from, N - 1);
  assert.equal(last.glowing, N - 1, "it stays on the last node until the loop restarts");
  assert.equal(curAt(N * HOP + 0.01, N).glowing, 0, "then head again");
});
