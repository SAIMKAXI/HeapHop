// Examples, lessons, predictions, mistake demos, glossary.
import { test } from "node:test";
import assert from "node:assert/strict";
import { run } from "../../src/core/interpreter";
import { buildPrediction, resolveLesson, type Lesson } from "../../src/core/learn";
import { explainStep } from "../../src/core/explain";
import { TraceModel } from "../../src/core/trace";
import { detectLists } from "../../src/core/structures";
import { EXAMPLES } from "../../content/examples";
import { LESSONS } from "../../content/lessons";
import { GLOSSARY } from "../../content/glossary";
import { NODE, trace } from "./helpers";

test("7.1 the library has the 12 linked-list operations, each with a two-line intro", () => {
  const lists = EXAMPLES.filter((e) => e.group === "lists");
  for (const id of ["build", "traverse", "insert-front", "insert-end", "insert-position", "delete-front", "delete-end", "delete-value", "search", "reverse", "doubly", "circular"]) {
    assert.ok(lists.some((e) => e.id === id), `missing example ${id}`);
  }
  for (const e of EXAMPLES.filter((x) => x.group !== "pointers")) {
    assert.equal(e.description.split("\n").length, 2, `${e.id}: intro must be two lines`);
  }
  assert.equal(new Set(EXAMPLES.map((e) => e.id)).size, EXAMPLES.length, "ids are unique");
});

test("7.1 every linked-list example runs to the end", () => {
  for (const e of EXAMPLES.filter((x) => x.group === "lists")) {
    const r = run(e.code);
    if (!r.ok) assert.fail(`${e.id}: ${r.error.message}`);
    assert.equal(r.trace.status, "completed", `${e.id}: ${r.trace.notice}`);
  }
});

test("7.4 mistake demos: each one ends the way its title says", () => {
  const demo = (id: string) => new TraceModel(trace(EXAMPLES.find((e) => e.id === id)!.code));
  const said = (m: TraceModel) => Array.from({ length: m.length }, (_, i) => explainStep(m, i).map((s) => s.text).join(" ")).join("\n");

  const lost = demo("lost-head");
  assert.equal(lost.trace.status, "completed");
  assert.match(said(lost), /No pointer reaches Node #1 any more, and it was never deleted\. Its memory is leaked/);

  const dangling = demo("dangling");
  assert.equal(dangling.trace.status, "error");
  assert.equal(dangling.trace.steps[dangling.length - 1].error?.code, "use_after_free");
  assert.match(said(dangling), /`head` and `other` still hold the old address of Node #1/);

  const forgot = demo("forgot-null");
  assert.equal(forgot.trace.status, "error");
  assert.equal(forgot.trace.steps[forgot.length - 1].error?.code, "uninitialised_read");
  assert.match(said(forgot), /set `next = nullptr`/);
});

test("7.2 every lesson loads, runs, and places all its checkpoints in running order", async () => {
  assert.ok(LESSONS.length >= 3);
  for (const entry of LESSONS) {
    const lesson = await entry.load();
    assert.equal(lesson.id, entry.id);
    const r = run(lesson.code, undefined, lesson.input ?? "");
    if (!r.ok) assert.fail(`${entry.id}: ${r.error.message}`);
    const resolved = resolveLesson(lesson, new TraceModel(r.trace));
    assert.deepEqual(resolved.problems, [], entry.id);
    assert.equal(resolved.checkpoints.length, lesson.checkpoints.length);
    assert.ok(resolved.checkpoints.length >= 4, `${entry.id} should have at least four checkpoints`);
    for (const cp of resolved.checkpoints) assert.ok(cp.step >= 0 && cp.step < r.trace.steps.length);
  }
});

test("the tree lessons build real binary trees and ask the student to predict", async () => {
  const trees = LESSONS.filter((l) => l.topic === "bst" || l.topic === "avl");
  for (const id of ["build-a-bst", "search-a-bst", "inorder-traversal", "avl-rotation"]) assert.ok(trees.some((l) => l.id === id), id);
  for (const entry of trees) {
    const lesson = await entry.load();
    const r = run(lesson.code);
    if (!r.ok) assert.fail(`${entry.id}: ${r.error.message}`);
    assert.equal(r.trace.status, "completed", `${entry.id}: ${r.trace.notice}`);
    assert.equal(r.trace.steps.at(-1)!.heap.filter((h) => h.kind === "object").length, 0, `${entry.id} frees every node`);
    const { checkpoints } = resolveLesson(lesson, new TraceModel(r.trace));
    const shown = checkpoints.filter((c) => detectLists(r.trace.steps[c.step]).trees.some((t) => t.nodes.length >= 3));
    assert.ok(shown.length >= 1, `${entry.id}: a checkpoint shows a tree of three or more nodes`);
    if (entry.id !== "inorder-traversal") assert.ok(checkpoints.some((c) => c.prediction), `${entry.id} has a prediction`);
  }
});

test("7.2 one lesson plays start to finish: each checkpoint lands on its line", async () => {
  const lesson = await LESSONS.find((l) => l.id === "walk-a-list")!.load();
  const r = run(lesson.code);
  assert.ok(r.ok);
  const m = new TraceModel(r.trace);
  const { checkpoints } = resolveLesson(lesson, m);
  for (const cp of checkpoints) {
    const shown = cp.prediction ? cp.prediction.revealStep : cp.step;
    assert.equal(m.trace.steps[shown].sourceLine, cp.line);
  }
  assert.ok(checkpoints.some((c) => c.prediction), "the lesson includes a prediction");
});

test("7.3 the right answer of a prediction comes from the next step of the trace", () => {
  const m = new TraceModel(trace(`${NODE}\nint main() {\nNode* head = new Node(1);\nhead->next = new Node(2);\nNode* cur = head;\ncur = cur->next;\ncur = cur->next;\nreturn 0; }`));
  const first = buildPrediction(m, m.stepsOnLine(6)[0], "cur")!;
  assert.equal(first.answer, "h2");
  assert.deepEqual(first.options.map((o) => o.label), ["Node #1", "Node #2", "nullptr (nothing)"]);
  assert.equal(first.options.filter((o) => o.id === first.answer).length, 1, "exactly one option is right");
  assert.match(first.question, /where will `cur` point after `cur = cur->next;`\?/);
  const second = buildPrediction(m, m.stepsOnLine(7)[0], "cur")!;
  assert.equal(second.answer, null, "it becomes nullptr");
  assert.equal(buildPrediction(m, m.stepsOnLine(6)[0], "nosuch"), null);
});

test("7.3 predictions in the lessons always offer the correct option", async () => {
  for (const entry of LESSONS) {
    const lesson = await entry.load();
    const r = run(lesson.code);
    assert.ok(r.ok);
    const m = new TraceModel(r.trace);
    for (const cp of resolveLesson(lesson, m).checkpoints) {
      if (!cp.prediction) continue;
      assert.ok(cp.prediction.options.some((o) => o.id === cp.prediction!.answer), `${entry.id} checkpoint ${cp.index + 1}`);
      assert.equal(cp.step, cp.prediction.revealStep - 1, "the question is asked one step before the answer shows");
    }
  }
});

test("7.2 a broken lesson is reported in plain words instead of crashing", () => {
  const m = new TraceModel(trace(`int main() {\nint a = 1;\nint b = 2;\nreturn 0; }`));
  const bad: Lesson = { id: "x", title: "x", summary: "", code: "", checkpoints: [
    { at: "int z = 9;", text: "" },
    { at: "int", text: "" },
    { at: "int a = 1;", occurrence: 3, text: "" },
    { at: "int b = 2;", predict: "b", text: "" },
    { line: 3, text: "fine" },
    { line: 2, text: "out of order" },
  ] };
  const { problems, checkpoints } = resolveLesson(bad, m);
  assert.equal(checkpoints.length, 2);
  assert.match(problems[0], /no line reads "int z = 9;"/);
  assert.match(problems[1], /appears on lines 1, 2, 3/);
  assert.match(problems[2], /no run number 3/);
  assert.match(problems[3], /cannot ask about "b"/);
  assert.match(problems[4], /Put them in running order/);
});

test("7.5 the glossary defines the core words in one line each", () => {
  for (const word of ["head", "next", "nullptr", "new", "delete"]) {
    assert.ok(GLOSSARY[word], `missing ${word}`);
    assert.ok(!GLOSSARY[word].includes("\n") && GLOSSARY[word].length < 140);
  }
});

test("7.3 a prediction about a reference parameter is answered correctly", async () => {
  // delete-safely asks where `head` (a Node*& parameter) points after head = head->next.
  const lesson = await LESSONS.find((l) => l.id === "delete-safely")!.load();
  const r = run(lesson.code);
  assert.ok(r.ok);
  const m = new TraceModel(r.trace);
  const cp = resolveLesson(lesson, m).checkpoints.find((c) => c.prediction)!;
  // Nodes are pushed 30, 20, 10, so the list is #3 -> #2 -> #1 and head moves to Node #2.
  assert.equal(m.nameOf(cp.prediction!.answer!), "Node #2");
});

test("11.2 every Learn topic has at least two lessons, and lesson ids are unique", () => {
  for (const topic of ["sorting", "lists", "doubly", "stacks", "queues", "bst", "avl", "heaps", "graphs"] as const) {
    assert.ok(LESSONS.filter((l) => l.topic === topic).length >= 2, topic);
  }
  assert.equal(new Set(LESSONS.map((l) => l.id)).size, LESSONS.length);
});

test("the lesson list shows the same title and summary as each lesson file", async () => {
  for (const entry of LESSONS) {
    const lesson = await entry.load();
    assert.equal(entry.title, lesson.title, `${entry.id} title`);
    assert.equal(entry.summary, lesson.summary, `${entry.id} summary`);
  }
});
