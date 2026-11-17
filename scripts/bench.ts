// Performance benchmark: interpreter timings next to their budgets.
//   npm run bench
import { performance } from "node:perf_hooks";
import { run } from "../src/core/interpreter";

const NODE = `struct Node { int data; Node* next; Node(int d) : data(d), next(nullptr) {} };`;

/** A program that builds an n-node list with tail insertion (two steps per node). */
function buildList(n: number): string {
  return `${NODE}
int main() {
  Node* head = new Node(0);
  Node* tail = head;
  for (int i = 1; i < ${n}; i++) {
    tail->next = new Node(i);
    tail = tail->next;
  }
  return 0;
}`;
}

/** A program whose trace is close to the step cap: build a short list, then walk it many times. */
function longRun(): string {
  return `${NODE}
int main() {
  Node* head = new Node(1);
  head->next = new Node(2);
  head->next->next = new Node(3);
  int total = 0;
  for (int round = 0; round < 150; round++) {
    Node* cur = head;
    while (cur != nullptr) {
      total += cur->data;
      cur = cur->next;
    }
  }
  return 0;
}`;
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

function time(label: string, code: string, budgetMs: number, runs = 9) {
  const first = run(code);
  if (!first.ok) {
    console.log(`${label.padEnd(34)} FAILED: ${first.error.message}`);
    return;
  }
  const times: number[] = [];
  for (let i = 0; i < runs; i++) {
    const t0 = performance.now();
    run(code);
    times.push(performance.now() - t0);
  }
  const ms = median(times);
  const steps = first.trace.steps.length;
  const last = first.trace.steps[steps - 1];
  // Steps share the cells that did not change, so count each distinct cell object once.
  const seen = new Set<object>();
  const walk = (m: { children?: object[] }) => { if (seen.has(m)) return; seen.add(m); (m.children as { children?: object[] }[] | undefined)?.forEach(walk); };
  for (const st of first.trace.steps) { st.heap.forEach(walk); st.stack.forEach((f) => f.variables.forEach(walk)); }
  const verdict = ms <= budgetMs ? "within budget" : "OVER BUDGET";
  console.log(
    `${label.padEnd(34)} ${ms.toFixed(1).padStart(8)} ms   budget ${String(budgetMs).padStart(4)} ms   ${verdict}` +
      `   (${steps} steps, ${last.heap.length} heap objects, status ${first.trace.status}, ${seen.size} distinct memory cells)`
  );
}

console.log("HeapHop benchmark: median of 9 runs, interpreter only (no Worker, no rendering)\n");
time("2000-step run", longRun(), 300);
time("build a 50-node list", buildList(50), 300);
time("build a 200-node list", buildList(200), 300);
