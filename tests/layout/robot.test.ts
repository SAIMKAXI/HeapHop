// The robot's moves for one step forward or back, planned from what the step changed and
// where things are drawn.
import { test } from "node:test";
import assert from "node:assert/strict";
import { detectLists, planLists } from "../../src/core/structures";
import { TraceModel } from "../../src/core/trace";
import type { TraceEvent } from "../../src/core/types";
import { layoutStep, perch, planRobotMove, type Layout, type RobotBeat } from "../../src/layout";
import { NODE, trace } from "../core/helpers";

const HOME = { x: 900, y: 10 };

function setup(code: string) {
  const t = trace(code);
  const model = new TraceModel(t);
  const plan = planLists(t);
  const layouts: Layout[] = t.steps.map((s, i) => layoutStep(s, i, plan, detectLists(s)));
  /** First step whose events match. */
  const stepWhere = (match: (e: TraceEvent) => boolean) => {
    const i = model.events.findIndex((events) => events?.some(match));
    assert.ok(i > 0, "the step exists");
    return i;
  };
  /** Plan for stepping onto step i from i-1 (forward) or onto i-1 from i (back). */
  const move = (i: number, direction: 1 | -1, standingOn: string | null = null, atEnd = false) =>
    planRobotMove({
      events: model.events[i], direction,
      before: direction > 0 ? layouts[i - 1] : layouts[i],
      after: direction > 0 ? layouts[i] : layouts[i - 1],
      standingOn, home: HOME, atEnd,
    });
  return { t, model, layouts, stepWhere, move };
}

const box = (l: Layout, id: string) => l.nodes.find((n) => n.id === id)!;
const rect = (l: Layout, id: string) => { const { x, y, width, height } = box(l, id); return { x, y, width, height }; };
const kinds = (beats: RobotBeat[]) => beats.map((b) => b.kind);

const LIST = `#include <iostream>
using namespace std;
${NODE}
int main() {
    Node* a = new Node(10);
    Node* b = new Node(20);
    a->next = b;
    Node* cur = a;
    cur = cur->next;
    cout << cur->data << endl;
    a->next = nullptr;
    delete b;
    delete a;
    return 0;
}
`;

const linkStep = (s: ReturnType<typeof setup>) =>
  s.stepWhere((e) => e.type === "pointer_changed" && e.owner.kind === "object" && !e.declared && e.to !== null);

test("stepping forward over a->next = b: the robot drags the arrow from a to b, then sits on b", () => {
  const s = setup(LIST);
  const i = linkStep(s);
  const m = s.move(i, 1, "h1");
  const after = s.layouts[i];
  const arrow = after.arrows.find((a) => a.from === "h1" && a.to === "h2")!;
  assert.deepEqual(kinds(m.beats), ["drag", "fly"]);
  const drag = m.beats[0] as Extract<RobotBeat, { kind: "drag" }>;
  assert.equal(drag.cellId, arrow.id);
  assert.deepEqual(drag.base, arrow.start);
  assert.deepEqual(drag.to, arrow.end, "the tip ends where the real arrow ends");
  const nullBox = s.layouts[i - 1].terminals.find((t) => t.id === arrow.id)!;
  assert.deepEqual(drag.from, { x: nullBox.x + nullBox.width / 2, y: nullBox.y + nullBox.height / 2 }, "the tip starts at NULL");
  assert.equal(m.standOn, "h2");
  assert.deepEqual(m.beats[1], { kind: "fly", to: perch(box(after, "h2")) });
  assert.deepEqual(m.hide, [arrow.id], "the real arrow is hidden while the robot carries it");
  assert.equal(m.thrust, false, "lists: the robot hovers");
});

test("stepping back over the same line: the robot pulls the arrow back to NULL and sits on a", () => {
  const s = setup(LIST);
  const i = linkStep(s);
  const m = s.move(i, -1, "h2");
  const shown = s.layouts[i - 1];
  const cellId = s.layouts[i].arrows.find((a) => a.from === "h1" && a.to === "h2")!.id;
  const drag = m.beats.find((b) => b.kind === "drag") as Extract<RobotBeat, { kind: "drag" }>;
  const nullBox = shown.terminals.find((t) => t.id === cellId)!;
  assert.deepEqual(drag.to, { x: nullBox.x + nullBox.width / 2, y: nullBox.y + nullBox.height / 2 });
  assert.equal(drag.from.x, box(shown, "h2").x, "the tip starts on b");
  assert.equal(m.standOn, "h1");
  assert.deepEqual(m.beats.at(-1), { kind: "fly", to: perch(box(shown, "h1")) });
});

test("cur = cur->next: no arrow to drag, the robot follows cur to the next node", () => {
  const s = setup(LIST);
  const i = s.stepWhere((e) => e.type === "pointer_changed" && e.owner.kind === "frame" && e.name === "cur" && !e.declared);
  const m = s.move(i, 1, "h1");
  assert.deepEqual(kinds(m.beats), ["fly"]);
  assert.equal(m.standOn, "h2");
  assert.equal(s.move(i, -1, "h2").standOn, "h1", "stepping back follows cur back");
});

test("new and delete: the robot drops a new node in and carries a deleted one away, and the reverse going back", () => {
  const s = setup(LIST);
  const born = s.stepWhere((e) => e.type === "alloc" && e.objectId === "h2");
  const drop = s.move(born, 1).beats.find((b) => b.kind === "drop");
  assert.deepEqual(drop, { kind: "drop", nodeId: "h2", box: rect(s.layouts[born], "h2") });
  assert.ok(s.move(born, 1).hide.includes("h2"), "the node appears when the robot sets it down");
  assert.ok(s.move(born, 1).beats.every((b) => b.kind !== "drag"), "the constructor setting next to nullptr is not a drag");
  assert.deepEqual(s.move(born, -1).beats.find((b) => b.kind === "carry"), { kind: "carry", nodeId: "h2", box: rect(s.layouts[born], "h2") });

  const gone = s.stepWhere((e) => e.type === "free" && e.objectId === "h2");
  assert.deepEqual(s.move(gone, 1).beats.find((b) => b.kind === "carry"), { kind: "carry", nodeId: "h2", box: rect(s.layouts[gone - 1], "h2") });
  assert.equal(s.move(gone, -1).beats.find((b) => b.kind === "drop")?.kind, "drop");
});

test("a step that changes nothing on the heap keeps the robot on its node", () => {
  const s = setup(LIST);
  const i = s.stepWhere((e) => e.type === "output");
  const m = s.move(i, 1, "h2");
  assert.equal(m.standOn, "h2");
  assert.deepEqual(m.beats, [{ kind: "fly", to: perch(box(s.layouts[i], "h2")) }]);
});

test("at the first or last step the robot goes home", () => {
  const s = setup(LIST);
  const m = s.move(linkStep(s), 1, "h1", true);
  assert.equal(m.standOn, null);
  assert.deepEqual(m.beats.at(-1), { kind: "fly", to: HOME });
});

test("trees: every move uses rocket thrust", () => {
  const s = setup(`#include <iostream>
using namespace std;
struct T { int data; T* left; T* right; T(int d) : data(d), left(nullptr), right(nullptr) {} };
int main() {
    T* root = new T(50);
    root->left = new T(30);
    root->right = new T(70);
    T* cur = root;
    cur = cur->right;
    return 0;
}
`);
  const i = s.stepWhere((e) => e.type === "pointer_changed" && e.name === "right" && !e.declared);
  const m = s.move(i, 1, "h1");
  assert.equal(m.thrust, true);
  assert.ok(m.beats.some((b) => b.kind === "drag"));
  const walk = s.stepWhere((e) => e.type === "pointer_changed" && e.name === "cur" && !e.declared);
  assert.equal(s.move(walk, 1, "h1").standOn, "h3");
});
