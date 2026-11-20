// The runner, its time limit, its cache, and the Worker message handler.
// A fake Worker stands in for the browser's, running the real handler.
import { test } from "node:test";
import assert from "node:assert/strict";
import { Runner, TraceCache, type WorkerLike } from "../../src/runtime";
import { handle } from "../../src/runtime/handler";
import { PROTOCOL_VERSION, type RunRequest, type RunResponse } from "../../src/runtime/protocol";
import { DEFAULT_LIMITS } from "../../src/core/types";

const CODE = `struct Node { int data; Node* next; };
int main() { Node* a = new Node(); a->data = 1; Node* b = new Node(); int x = 0; x = 1; x = 2; return 0; }`;

class FakeWorker implements WorkerLike {
  static created = 0;
  onmessage: ((event: { data: RunResponse }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  posted: RunRequest[] = [];
  terminated = false;
  constructor(private mode: "answer" | "hang" | "crash" | "old" = "answer") { FakeWorker.created++; }
  postMessage(message: RunRequest) {
    this.posted.push(message);
    if (this.mode === "hang") return;
    setTimeout(() => {
      if (this.terminated) return;
      if (this.mode === "crash") return this.onerror?.(new Error("boom"));
      // structuredClone is what postMessage does to the data on its way to the page.
      const response = structuredClone(handle(message));
      if (this.mode === "old") response.v = PROTOCOL_VERSION + 1;
      this.onmessage?.({ data: response });
    }, 0);
  }
  terminate() { this.terminated = true; }
}

function setup(mode: ConstructorParameters<typeof FakeWorker>[0] = "answer", timeoutMs = 200) {
  const workers: FakeWorker[] = [];
  const runner = new Runner(() => { const w = new FakeWorker(mode); workers.push(w); return w; }, { timeoutMs });
  return { runner, workers };
}

test("3.1 runProgram returns a trace produced in the worker", async () => {
  const { runner, workers } = setup();
  const r = await runner.run(CODE);
  assert.ok(r.ok);
  assert.equal(r.trace.status, "completed");
  assert.equal(workers.length, 1);
  assert.equal(workers[0].posted[0].v, PROTOCOL_VERSION);
});

test("3.1 the worker is reused for the next run", async () => {
  const { runner, workers } = setup();
  await runner.run(CODE);
  await runner.run(CODE + "\n");
  assert.equal(workers.length, 1);
  assert.equal(workers[0].posted.length, 2);
});

test("3.1 steps still share unchanged cells after crossing the worker boundary", async () => {
  const { runner } = setup();
  const r = await runner.run(CODE);
  assert.ok(r.ok);
  const steps = r.trace.steps.filter((s) => s.kind === "statement");
  const a = steps[steps.length - 1].heap[0];
  assert.equal(steps[steps.length - 2].heap[0], a, "structured clone keeps shared references");
});

test("3.2 a run that never answers is stopped by the time limit and the worker is killed", async () => {
  const { runner, workers } = setup("hang", 50);
  const started = Date.now();
  const r = await runner.run(CODE);
  assert.ok(!r.ok);
  assert.equal(r.error.kind, "timeout");
  assert.match(r.error.message, /stuck in a loop/);
  assert.ok(Date.now() - started < 1000);
  assert.equal(workers[0].terminated, true);
});

test("3.2 after a timeout the next run gets a fresh worker", async () => {
  const workers: FakeWorker[] = [];
  let mode: "hang" | "answer" = "hang";
  const runner = new Runner(() => { const w = new FakeWorker(mode); workers.push(w); return w; }, { timeoutMs: 30 });
  assert.equal((await runner.run(CODE)).ok, false);
  mode = "answer";
  assert.equal((await runner.run(CODE)).ok, true);
  assert.equal(workers.length, 2);
});

test("3.2 an infinite loop comes back quickly as a truncated trace", async () => {
  const { runner } = setup("answer", 3000);
  const started = Date.now();
  const r = await runner.run(`int main() { int i = 0; while (true) { i++; } return 0; }`);
  assert.ok(r.ok);
  assert.equal(r.trace.status, "truncated");
  assert.ok(Date.now() - started < 3000, "well inside the 3 second budget");
});

test("3.3 running unchanged code again is answered from the cache", async () => {
  const { runner, workers } = setup();
  const first = await runner.run(CODE);
  const second = await runner.run(CODE);
  assert.equal(second, first);
  assert.equal(workers[0].posted.length, 1);
  const third = await runner.run(CODE, { fresh: true });
  assert.notEqual(third, first);
});

test("3.3 the cache key includes the limits; timeouts are not cached", async () => {
  const cache = new TraceCache(2);
  const ok = handle({ v: PROTOCOL_VERSION, id: 1, type: "run", code: CODE, input: "", limits: DEFAULT_LIMITS }).result;
  cache.set("a", DEFAULT_LIMITS, ok);
  assert.equal(cache.get("a", DEFAULT_LIMITS), ok);
  assert.equal(cache.get("a", { ...DEFAULT_LIMITS, maxSteps: 10 }), undefined);
  cache.set("t", DEFAULT_LIMITS, { ok: false, error: { kind: "timeout", message: "" } });
  assert.equal(cache.get("t", DEFAULT_LIMITS), undefined);
  cache.set("b", DEFAULT_LIMITS, ok);
  cache.set("c", DEFAULT_LIMITS, ok);
  assert.equal(cache.size, 2);
  assert.equal(cache.get("a", DEFAULT_LIMITS), undefined, "oldest entry was evicted");
});

test("a newer run replaces one still in progress", async () => {
  const { runner } = setup("hang", 5000);
  const first = runner.run("int main() { return 0; }");
  const second = runner.run(CODE);
  const r1 = await first;
  assert.ok(!r1.ok);
  assert.equal(r1.error.kind, "cancelled");
  runner.dispose();
  const r2 = await second;
  assert.ok(!r2.ok);
});

test("a worker crash and a version mismatch come back as readable errors", async () => {
  const crash = await setup("crash").runner.run(CODE);
  assert.ok(!crash.ok && crash.error.kind === "internal");
  const old = await setup("old").runner.run(CODE);
  assert.ok(!old.ok && /Reload the page/.test(old.error.message));
  const bad = handle({ v: 99, id: 1, type: "run", code: CODE, input: "", limits: DEFAULT_LIMITS });
  assert.ok(!bad.result.ok);
});

test("parse errors pass through the worker with their line number", async () => {
  const r = await setup().runner.run("int main() {\n int x = 5\n return 0; }");
  assert.ok(!r.ok);
  assert.equal(r.error.kind, "parse");
  assert.equal(r.error.line, 2);
});

test("8.8 a forged message to the worker is answered with a readable error, never a crash", () => {
  const forged = [
    null,
    "run",
    { v: PROTOCOL_VERSION, id: 1, type: "run", code: 42, input: "", limits: DEFAULT_LIMITS },
    { v: PROTOCOL_VERSION, id: 2, type: "run", code: "int main() { return 0; }", input: { toString: 1 }, limits: DEFAULT_LIMITS },
    { v: PROTOCOL_VERSION, id: 3, type: "run", code: "int main() { return 0; }", input: "", limits: "fast" },
    { v: PROTOCOL_VERSION, id: 4, type: "steal", code: "int main() { return 0; }", input: "", limits: DEFAULT_LIMITS },
  ];
  for (const message of forged) {
    const reply = handle(message as unknown as RunRequest);
    assert.equal(reply.type, "result");
    assert.equal(reply.result.ok, false);
    if (!reply.result.ok) assert.match(reply.result.error.message, /not a valid run request|updated/);
  }
});

test("8.8 the worker never raises its own safety limits, whatever the page asks for", () => {
  const greedy = { maxSteps: 1e9, maxLoopIterations: 1e9, maxCallDepth: 1e9, maxHeapObjects: 1e9, maxOutputChars: 1e9 };
  const reply = handle({ v: PROTOCOL_VERSION, id: 5, type: "run", code: "int main() { while (true) {} return 0; }", input: "", limits: greedy });
  assert.ok(reply.result.ok);
  if (reply.result.ok) {
    assert.equal(reply.result.trace.status, "truncated");
    assert.ok(reply.result.trace.steps.length <= DEFAULT_LIMITS.maxSteps + 1);
  }
});
