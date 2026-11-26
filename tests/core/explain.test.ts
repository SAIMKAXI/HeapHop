// Explanations: one rule per event type, checked on real steps.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describeEvent, explainObject, explainPointer, explainStep } from "../../src/core/explain";
import { TraceModel } from "../../src/core/trace";
import { NODE, trace } from "./helpers";

const fixture = (name: string) => readFileSync(join(__dirname, "..", "fixtures", name), "utf8");
const model = (code: string) => new TraceModel(trace(code));
/** Sentences of the n-th step that executed a line. */
const at = (m: TraceModel, line: number, nth = 0) => explainStep(m, m.stepsOnLine(line)[nth]).map((s) => s.text);
const lastAt = (m: TraceModel, line: number) => at(m, line, m.stepsOnLine(line).length - 1);

const BASIC = `${NODE}
int main() {
Node* head = new Node(1);
head->next = new Node(2);
Node* cur = head;
cur = cur->next;
cur = cur->next;
head->data = 7;
int count = 0;
Node* p;
return 0; }`;

test("allocation: new creates a numbered node", () => {
  const m = model(BASIC);
  const texts = at(m, 1); // the constructor's call step
  assert.ok(texts.includes("`new` creates Node #1 on the heap."), texts.join(" | "));
});

test("pointer declared with a target, as nullptr, and with no value", () => {
  const m = model(`${NODE}\nint main() {\nNode* a = new Node(1);\nNode* b = nullptr;\nNode* c;\nreturn 0; }`);
  assert.equal(lastAt(m, 3)[0], "`a` is created and points at Node #1.");
  assert.deepEqual(at(m, 4), ["`b` is created as nullptr: it points at nothing."]);
  assert.match(at(m, 5)[0], /`c` is created but not given a value yet/);
});

test("a field assignment names the object that owns the field", () => {
  const m = model(BASIC);
  assert.equal(lastAt(m, 4)[0], "`next` of Node #1 now points at Node #2. Before, it was nullptr.");
});

test("cur = cur->next is described as moving along the link", () => {
  const m = model(BASIC);
  assert.deepEqual(at(m, 6), ["`cur` moves along `next` from Node #1 to Node #2."]);
  assert.deepEqual(at(m, 7), ["`cur` follows `next` of Node #2, which is nullptr. `cur` is now nullptr: there is no node after Node #2."]);
});

test("pointer reassignment shows before and after", () => {
  const m = model(`${NODE}\nint main() {\nNode* a = new Node(1);\nNode* b = new Node(2);\nNode* p = a;\np = b;\np = nullptr;\nreturn 0; }`);
  assert.deepEqual(at(m, 6), ["`p` now points at Node #2 instead of Node #1."]);
  assert.deepEqual(at(m, 7), ["`p` is set to nullptr. It no longer points at Node #2."]);
});

test("value changes and declarations", () => {
  const m = model(BASIC);
  assert.deepEqual(at(m, 8), ["`data` of Node #1 changes from 1 to 7."]);
  assert.deepEqual(at(m, 9), ["`count` is created with the value 0."]);
});

test("delete: the object is gone, and pointers that still hold its address are named", () => {
  const m = model(`${NODE}\nint main() {\nNode* a = new Node(1);\nNode* b = a;\ndelete a;\nreturn 0; }`);
  const texts = at(m, 5);
  assert.equal(texts[0], "Node #1 is deleted: its memory is given back and the object no longer exists.");
  assert.equal(texts[1], "`a` and `b` still hold the old address of Node #1. They are dangling pointers: using them would be an error.");
});

test("a lost head is a leak, and the wording says it was never deleted", () => {
  const m = model(`${NODE}\nint main() {\nNode* head = new Node(1);\nhead = nullptr;\nreturn 0; }`);
  const s = explainStep(m, m.stepsOnLine(4)[0]);
  assert.equal(s[0].text, "No pointer reaches Node #1 any more, and it was never deleted. Its memory is leaked: the program can no longer use it or free it.");
  assert.equal(s[0].tone, "danger");
  assert.doesNotMatch(s.map((x) => x.text).join(" "), /is deleted/);
});

test("no leak or dangling wording when the trace does not show one", () => {
  const m = model(fixture("03_singly_struct_insert_end.cpp"));
  for (let i = 0; i < m.length - 1; i++) {
    const text = explainStep(m, i).map((s) => s.text).join(" ");
    assert.doesNotMatch(text, /leaked|dangling/, `step ${i + 1}: ${text}`);
  }
});

test("call and return", () => {
  const m = model(fixture("02_singly_struct_insert_front.cpp"));
  const call = m.events.findIndex((ev) => ev.some((e) => e.type === "frame_push" && e.functionName === "insertAtBeginning"));
  assert.match(explainStep(m, call).map((s) => s.text).join(" "), /`insertAtBeginning` is called from line 28\. It gets its own stack frame/);
  const ret = m.events.findIndex((ev) => ev.some((e) => e.type === "frame_pop" && e.functionName === "insertAtBeginning"));
  assert.match(explainStep(m, ret).map((s) => s.text).join(" "), /`insertAtBeginning` has returned\. Its stack frame and local variables are gone\./);
});

test("loop and if conditions say what happens next", () => {
  const m = model(`int main() {\nint i = 0;\nwhile (i < 1) {\ni++;\n}\nif (i == 5) i = 0;\nfor (int k = 0; k < 1; k++) { }\nreturn 0; }`);
  assert.equal(at(m, 3, 0)[0], "`i < 1` is true, so the loop body runs.");
  assert.equal(at(m, 3, 1)[0], "`i < 1` is false, so the loop ends.");
  assert.equal(at(m, 6)[0], "`i == 5` is false, so the code under this `if` is skipped.");
  assert.ok(m.stepsOnLine(7).some((s) => explainStep(m, s)[0].text === "`k < 1` is true, so the loop body runs."));
});

test("output, an unchanged line, the start and the end", () => {
  const m = model(`int main() {\nint x = 1;\ncout << "hi " << x;\nx;\nreturn 0; }`);
  assert.deepEqual(at(m, 3), ['Prints "hi 1".']);
  assert.deepEqual(at(m, 4), ["This line changes nothing in memory."]);
  assert.match(explainStep(m, 0)[0].text, /The program starts/);
  assert.equal(explainStep(m, m.length - 1)[0].tone, "good");
});

test("an error step explains the crash and gives advice", () => {
  const m = model(`${NODE}\nint main() {\nNode* p = nullptr;\np->data = 1;\nreturn 0; }`);
  const s = explainStep(m, m.length - 1);
  assert.equal(s[0].tone, "danger");
  assert.match(s[0].text, /The program stops here\. p is nullptr/);
  assert.match(s[1].text, /Check that the pointer is not nullptr/);
});

test("explainObject: created, who reaches it, where its fields point and since when", () => {
  const m = model(BASIC);
  const end = m.length - 2;
  const texts = explainObject(m, "h1", end).map((s) => s.text);
  assert.equal(texts[0], "Node #1 was created with `new` on line 1 (step 2).");
  assert.equal(texts[1], "One pointer reaches it now: `head`.");
  assert.equal(texts[2], "Its `next` points at Node #2. Last changed on line 4: `head->next = new Node(2);`.");
  const two = explainObject(m, "h2", end).map((s) => s.text);
  assert.equal(two[1], "One pointer reaches it now: `next` of Node #1.");
  assert.equal(two[2], "Its `next` points at nullptr. It has not changed since the object was created.");
});

test("explainObject separates deleted from leaked", () => {
  const del = model(`${NODE}\nint main() {\nNode* a = new Node(1);\ndelete a;\nreturn 0; }`);
  const d = explainObject(del, "h1", del.length - 2).map((s) => s.text).join(" ");
  assert.match(d, /It was deleted at step \d+ \(line 4\)/);
  assert.match(d, /`a` still holds its old address \(dangling\)/);
  const leak = model(`${NODE}\nint main() {\nNode* a = new Node(1);\na = nullptr;\nreturn 0; }`);
  const l = explainObject(leak, "h1", leak.length - 2).map((s) => s.text).join(" ");
  assert.match(l, /never deleted: it is leaked\. That is different from being deleted/);
  assert.equal(explainObject(leak, "h1", 0)[1].text, "At this step it does not exist yet.");
});

test("explainPointer: source, target, previous target, and the statement that changed it", () => {
  const m = model(BASIC);
  const end = m.length - 2;
  const cur = explainPointer(m, "f0_cur", m.stepsOnLine(6)[0])!;
  assert.equal(cur.label, "`cur`");
  assert.equal(cur.owner.kind, "frame");
  assert.equal(cur.target, "Node #2");
  assert.equal(cur.previous, "Node #1");
  assert.deepEqual(cur.lastChange && { line: cur.lastChange.line, source: cur.lastChange.source }, { line: 6, source: "cur = cur->next;" });
  const field = explainPointer(m, "h1_next", end)!;
  assert.equal(field.label, "`next` of Node #1");
  assert.equal(field.owner.kind, "object");
  assert.equal(field.target, "Node #2");
  assert.equal(field.lastChange!.line, 4);
  assert.equal(explainPointer(m, "f0_p", end)!.state, "uninitialised");
  assert.equal(explainPointer(m, "f0_count", end), null, "not a pointer");
});

test("explainPointer on a dangling pointer and on a pointer inside a stack object", () => {
  const m = model(`${NODE}\nint main() {\nNode* a = new Node(1);\ndelete a;\nreturn 0; }`);
  const a = explainPointer(m, "f0_a", m.length - 2)!;
  assert.equal(a.state, "dangling");
  assert.equal(a.target, "Node #1, which was deleted");
  const list = model(fixture("09_singly_class_basic.cpp"));
  const head = explainPointer(list, "f0_list_head", list.length - 2)!;
  assert.equal(head.label, "`list.head`");
  assert.equal(head.target, "Node #1");
});

test("describeEvent gives a short line for every history entry", () => {
  const m = model(fixture("08_singly_struct_reverse.cpp"));
  for (const obj of m.allObjects()) {
    for (const h of obj.history) {
      const line = describeEvent(m, h);
      assert.ok(line.length > 3 && !/undefined|\bh\d+\b/.test(line), line);
    }
  }
});

test("reverse a list, then ask about Node #2", () => {
  const m = model(fixture("08_singly_struct_reverse.cpp"));
  const id = m.allObjects().find((o) => o.displayName === "Node #2")!.id;
  const texts = explainObject(m, id, m.length - 2).map((s) => s.text);
  assert.match(texts[0], /^Node #2 was created with `new` on line 8/);
  assert.match(texts[1], /pointers? reach(es)? it now: /);
  assert.match(texts[2], /^Its `next` points at Node #1\. Last changed on line 17: `cur->next = prev;`\.$/);
});

test("no explanation ever leaks an internal id", () => {
  for (const f of ["10_singly_class_full.cpp", "12_doubly_class.cpp", "14_circular_class.cpp", "20_lab3_add_remove_reverse.cpp", "21_lab9_avl_insert.cpp"]) {
    const m = model(fixture(f));
    for (let i = 0; i < m.length; i++) {
      for (const s of explainStep(m, i)) assert.doesNotMatch(s.text, /\b[hf]\d+(_\w+)?\b|undefined|NaN/, `${f} step ${i + 1}: ${s.text}`);
    }
  }
});

test("a change made through a reference parameter is explained once, on the real variable", () => {
  const m = new TraceModel(trace(`struct Node { int data; Node* next; };
void pop(Node*& head) {
head = head->next;
}
int main() { Node* head = new Node(); head->next = new Node(); head->next->next = NULL; pop(head); return 0; }`));
  const step = m.stepsOnLine(3).find((i) => m.trace.steps[i].kind === "statement")!;
  const text = explainStep(m, step).map((s) => s.text);
  assert.equal(text.filter((t) => /moves along/.test(t)).length, 1, text.join(" | "));
  assert.ok(text.some((t) => /`head` \(in main\) moves along `next` from Node #1 to Node #2/.test(t)), text.join(" | "));
  assert.ok(text.some((t) => /`head` in `pop` is a reference to it/.test(t)), text.join(" | "));
});
