// Events, object index, reverse references, numbering, line index, getStep.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { diffSteps, TraceModel } from "../../src/core/trace";
import type { TraceEvent } from "../../src/core/types";
import { run } from "../../src/core/interpreter";
import { NODE, trace } from "./helpers";

const model = (code: string) => new TraceModel(trace(code));
const onLine = (m: TraceModel, line: number, nth = 0) => m.getStep(m.stepsOnLine(line)[nth]);
const ofType = <T extends TraceEvent["type"]>(events: TraceEvent[], type: T) =>
  events.filter((e): e is Extract<TraceEvent, { type: T }> => e.type === type);

const WALK = `${NODE}
int main() {
Node* head = new Node(1);
head->next = new Node(2);
head->next->data = 9;
Node* old = head;
head = head->next;
delete old;
cout << head->data;
return 0; }`;

test("allocation and the pointer that receives it", () => {
  const m = model(WALK);
  const ctor = m.events.findIndex((ev) => ofType(ev, "alloc").length > 0);
  assert.deepEqual(ofType(m.events[ctor], "alloc")[0], { type: "alloc", objectId: "h1", typeName: "Node" });
  const decl = onLine(m, 3, m.stepsOnLine(3).length - 1);
  const p = ofType(decl.events, "pointer_changed")[0];
  assert.equal(p.name, "head");
  assert.equal(p.to, "h1");
  assert.equal(p.declared, true);
  assert.deepEqual(p.owner, { kind: "frame", id: "f0", name: "main" });
});

test("a pointer reassignment carries the previous and the new target", () => {
  const m = model(WALK);
  const p = ofType(onLine(m, 7).events, "pointer_changed")[0];
  assert.equal(p.cellId, "f0_head");
  assert.equal(p.from, "h1");
  assert.equal(p.to, "h2");
  assert.equal(p.declared, false);
});

test("a field change names the object that owns the field", () => {
  const m = model(WALK);
  const v = ofType(onLine(m, 5).events, "value_changed")[0];
  assert.deepEqual(v.owner, { kind: "object", id: "h2", name: "Node" });
  assert.equal(v.name, "data");
  assert.equal(v.from, "2");
  assert.equal(v.to, "9");
});

test("delete gives a free event, and the dangling pointer is not reported as reassigned", () => {
  const m = model(WALK);
  const events = onLine(m, 8).events;
  assert.deepEqual(ofType(events, "free"), [{ type: "free", objectId: "h1", typeName: "Node" }]);
  assert.equal(ofType(events, "pointer_changed").length, 0);
});

test("frames pushed and popped, and output", () => {
  const m = model(`${NODE}\nint twice(int n) { return n * 2; }\nint main() {\nint x = twice(4);\ncout << x;\nreturn 0; }`);
  const all = m.events.flat();
  assert.ok(ofType(all, "frame_push").some((e) => e.functionName === "twice"));
  assert.ok(ofType(all, "frame_pop").some((e) => e.functionName === "twice"));
  assert.deepEqual(ofType(all, "output").map((e) => e.text), ["8"]);
});

test("losing the last pointer to a node reports became_unreachable", () => {
  const m = model(`${NODE}\nint main() {\nNode* head = new Node(1);\nhead = nullptr;\nreturn 0; }`);
  const events = onLine(m, 4).events;
  assert.deepEqual(ofType(events, "became_unreachable"), [{ type: "became_unreachable", objectId: "h1", typeName: "Node" }]);
  assert.equal(m.object("h1")!.unreachableStep, m.stepsOnLine(4)[0]);
  assert.equal(m.object("h1")!.freeStep, null);
});

test("diffSteps of a step with itself is empty; the first step only pushes main", () => {
  const t = trace(WALK);
  assert.deepEqual(diffSteps(t.steps[5], t.steps[5]), []);
  assert.deepEqual(diffSteps(null, t.steps[0]), [{ type: "frame_push", frameId: "f0", functionName: "main" }]);
});

test("an object's history is ordered and carries the source line of each event", () => {
  const m = model(WALK);
  const rec = m.object("h2")!;
  assert.equal(rec.displayName, "Node #2");
  assert.equal(rec.allocLine, 1, "created inside the constructor, declared on line 1");
  const story = rec.history.map((h) => `${h.sourceLine}:${h.event.type}`);
  assert.equal(story[0], "1:alloc");
  assert.ok(story.includes("4:pointer_changed"), "head->next = new Node(2) reaches it");
  assert.ok(story.includes("5:value_changed"));
  assert.ok(story.includes("7:pointer_changed"), "head = head->next now reaches it");
  const steps = rec.history.map((h) => h.step);
  assert.deepEqual(steps, [...steps].sort((a, b) => a - b));
  assert.equal(m.object("h2_next")!.id, "h2", "a cell id resolves to its object");
});

test("three pointers to one node are all listed", () => {
  const m = model(`${NODE}\nint main() {\nNode* a = new Node(1);\nNode* b = a;\nNode* c = new Node(2);\nc->next = a;\nreturn 0; }`);
  const refs = onLine(m, 6).incoming("h1");
  assert.deepEqual(refs.map((r) => r.cellId).sort(), ["f0_a", "f0_b", "h2_next"]);
  const field = refs.find((r) => r.cellId === "h2_next")!;
  assert.deepEqual(field.owner, { kind: "object", id: "h2", name: "Node" });
  assert.equal(field.name, "next");
  assert.deepEqual(onLine(m, 6).incoming("h2").map((r) => r.name), ["c"]);
});

test("references held inside an object on the stack are found", () => {
  const m = model(`${NODE}\nclass L { public: Node* head; L() { head = nullptr; } };\nint main() {\nL list;\nlist.head = new Node(1);\nreturn 0; }`);
  const refs = onLine(m, 5, m.stepsOnLine(5).length - 1).incoming("h1");
  assert.equal(refs[0].name, "list.head");
  assert.equal(refs[0].owner.kind, "frame");
});

test("numbers follow allocation order and do not move when an earlier node is freed", () => {
  const m = model(`${NODE}\nint main() {\nNode* a = new Node(1);\nNode* b = new Node(2);\ndelete a;\nNode* c = new Node(3);\nint* n = new int(5);\nreturn 0; }`);
  assert.deepEqual(m.allObjects().map((o) => o.displayName), ["Node #1", "Node #2", "Node #3", "int #1"]);
  assert.equal(m.nameOf("h2"), "Node #2");
  assert.equal(m.isAlive("h1", m.stepsOnLine(4)[0]), true);
  assert.equal(m.isAlive("h1", m.stepsOnLine(6)[0]), false);
  assert.equal(m.object("h1")!.freeStep, m.stepsOnLine(5)[0]);
});

test("the line index lists every execution of a line", () => {
  const m = model(`int main() {\nint s = 0;\nfor (int i = 0; i < 3; i++) {\ns += i;\n}\nreturn 0; }`);
  const runs = m.stepsOnLine(4);
  assert.equal(runs.length, 3);
  assert.equal(m.nextStepOnLine(4, runs[0]), runs[1]);
  assert.equal(m.nextStepOnLine(4, runs[2]), runs[0], "wraps to the first execution");
  assert.equal(m.nextStepOnLine(99, 0), -1);
});

test("getStep is cached and clamps its index", () => {
  const m = model(WALK);
  assert.equal(m.getStep(3), m.getStep(3));
  assert.equal(m.getStep(3).incoming("h1"), m.getStep(3).incoming("h1"));
  assert.equal(m.getStep(-5).index, 0);
  assert.equal(m.getStep(9999).index, m.length - 1);
  assert.equal(m.getStep(2).heapObject("nope"), undefined);
});

test("lastChangeOf finds the statement that last changed a pointer", () => {
  const m = model(WALK);
  const end = m.length - 1;
  assert.equal(m.lastChangeOf("f0_head", end)!.sourceLine, 7);
  assert.equal(m.lastChangeOf("f0_head", m.stepsOnLine(5)[0])!.sourceLine, 3);
  const born = m.lastChangeOf("h2_next", end)!;
  assert.equal(born.event.type, "alloc", "never changed after the constructor set it");
  assert.equal(born.sourceLine, 1);
});

test("reverse a list, then ask about Node #2", () => {
  const m = model(readFileSync(join(__dirname, "..", "fixtures", "08_singly_struct_reverse.cpp"), "utf8"));
  const node2 = m.allObjects().find((o) => o.displayName === "Node #2")!;
  assert.ok(node2.history.length >= 3);
  const lastStep = m.length - 2; // before the end step
  const who = m.getStep(lastStep).incoming(node2.id).map((r) => `${r.owner.name}:${r.name}`);
  assert.ok(who.length >= 1);
  const change = m.lastChangeOf(`${node2.id}_next`, lastStep)!;
  assert.match(m.trace.source[change.sourceLine - 1], /cur->next = prev/);
});

for (const file of readdirSync(join(__dirname, "..", "fixtures")).filter((f) => f.endsWith(".cpp"))) {
  test(`events add up for ${file}`, () => {
    const inputFile = join(__dirname, "..", "fixtures", file.replace(/\.cpp$/, ".input.txt"));
    const r = run(readFileSync(join(__dirname, "..", "fixtures", file), "utf8"), undefined, existsSync(inputFile) ? readFileSync(inputFile, "utf8") : "");
    assert.ok(r.ok);
    const m = new TraceModel(r.trace);
    const all = m.events.flat();
    const allocs = ofType(all, "alloc").length;
    const frees = ofType(all, "free").length;
    assert.equal(allocs - frees, m.trace.steps[m.length - 1].heap.length);
    assert.equal(m.allObjects().length, allocs);
    assert.equal(ofType(all, "frame_push").length, ofType(all, "frame_pop").length, "every call returns");
    assert.equal(ofType(all, "output").map((e) => e.text).join(""), m.trace.output);
  });
}

// ---- one selection lights up the canvas, the code panel and the timeline ----
import { highlightsFor } from "../../src/core/trace";

test("selecting an object marks its lines and its steps", () => {
  const m = model(WALK);
  const h = highlightsFor(m, { kind: "object", id: "h2" });
  assert.deepEqual([...h.objects], ["h2"]);
  assert.ok(h.lines.has(4) && h.lines.has(5) && h.lines.has(7));
  assert.deepEqual(h.steps, [...h.steps].sort((a, b) => a - b));
  assert.ok(h.steps.includes(m.stepsOnLine(5)[0]));
});

test("selecting a pointer marks every statement that changed it and the nodes it touched", () => {
  const m = model(WALK);
  const h = highlightsFor(m, { kind: "pointer", cellId: "f0_head" });
  assert.deepEqual([...h.lines].sort(), [3, 7]);
  assert.deepEqual([...h.objects].sort(), ["h1", "h2"]);
  assert.equal(h.steps.length, 2);
});

test("selecting a source line marks the nodes it touched and each time it ran", () => {
  const m = model(WALK);
  const h = highlightsFor(m, { kind: "line", line: 7 });
  assert.deepEqual([...h.objects].sort(), ["h1", "h2"]);
  assert.deepEqual(h.steps, m.stepsOnLine(7));
  assert.equal(highlightsFor(m, null).steps.length, 0);
});

test("outputUntil gives what the program has printed so far", () => {
  const m = model(`int main() {\ncout << "a";\nint x = 1;\ncout << "b" << endl;\nreturn 0; }`);
  assert.equal(m.outputUntil(0), "");
  assert.equal(m.outputUntil(m.stepsOnLine(2)[0]), "a");
  assert.equal(m.outputUntil(m.stepsOnLine(3)[0]), "a");
  assert.equal(m.outputUntil(m.length - 1), "ab\n");
  assert.equal(m.outputUntil(m.length + 5), m.trace.output);
});
