// Use case: a student opens Learn, plays every guided lesson and answers its predictions.
import { test } from "node:test";
import assert from "node:assert/strict";
import { textOf, setupBrowser } from "./harness.mjs";

const { newPage } = setupBrowser();

async function play(page, id, choose) {
  await page.click(`[data-lesson='${id}']`);
  await page.waitForSelector("[data-lesson-card]");
  const results = [];
  for (let guard = 0; guard < 20; guard++) {
    await page.waitForFunction(() => !document.querySelector("[data-lesson-travelling]"), { timeout: 30000 });
    if (await page.$("[data-prediction] [data-option]:not([disabled])")) {
      const options = await page.$$eval("[data-prediction] [data-option]", (b) => b.map((x) => x.textContent));
      await page.click(`[data-prediction] [data-option]:nth-child(${choose(options) + 1})`);
      await page.waitForSelector("[data-prediction-result]");
      results.push({
        result: await page.$eval("[data-prediction-result]", (e) => e.dataset.predictionResult),
        answer: await page.$eval("[data-prediction] [data-correct]", (e) => e.textContent),
      });
    }
    if (await page.$eval("[data-lesson-next]", (b) => b.disabled)) break;
    await page.click("[data-lesson-next]");
  }
  assert.match(await textOf(page, "[data-lesson-next]"), /Finished/);
  return results;
}

// Lessons live on their topic's page (/learn/<slug>); find each lesson's page once.
let index = null;
async function lessonIndex() {
  if (index) return index;
  const grid = await newPage({ path: "/learn", ready: "[data-topic-card]" });
  const slugs = await grid.$$eval("[data-topic-card]", (a) => a.map((x) => [x.dataset.topicCard, x.getAttribute("href")]));
  index = { topics: [], page: new Map() };
  for (const [topic, href] of slugs) {
    const page = await newPage({ path: href, ready: "[data-lesson]" });
    const ids = await page.$$eval("[data-lesson]", (l) => l.map((x) => x.dataset.lesson));
    index.topics.push(`${topic}:${ids.length}`);
    for (const id of ids) index.page.set(id, href);
    await page.close();
  }
  await grid.close();
  return index;
}
const learn = async (id) => ({ path: (await lessonIndex()).page.get(id), ready: "[data-lesson]" });
const WITH_QUESTIONS = ["walk-a-list", "insert-at-front", "delete-safely", "reverse-a-list", "build-a-bst", "search-a-bst", "avl-rotation"];

test("Learn lists the lessons by topic, each on its topic's page", async () => {
  assert.deepEqual((await lessonIndex()).topics, ["sorting:5", "lists:8", "doubly:5", "stacks:5", "queues:4", "bst:8", "avl:4", "heaps:3", "graphs:9"]);
});

test("every other lesson on the Learn page plays to the end in the browser", async () => {
  const ids = [...(await lessonIndex()).page.keys()];
  for (const id of ids.filter((x) => x !== "inorder-traversal" && !WITH_QUESTIONS.includes(x))) {
    const page = await newPage(await learn(id));
    await play(page, id, () => 0);
    assert.deepEqual(page.errors, [], id);
  }
});

test("lesson inorder-traversal plays to the end without questions", async () => {
  const page = await newPage(await learn("inorder-traversal"));
  assert.deepEqual(await play(page, "inorder-traversal", () => 0), []);
  assert.deepEqual(page.errors, []);
});

for (const id of WITH_QUESTIONS) {
  test(`lesson ${id}: a wrong answer shows the right one, and choosing it is marked right`, async () => {
    const first = await newPage(await learn(id));
    const wrong = await play(first, id, () => 0);
    assert.ok(wrong.length > 0, "the lesson asks at least one question");
    const second = await newPage(await learn(id));
    let i = 0;
    const right = await play(second, id, (options) => options.indexOf(wrong[i++].answer));
    assert.ok(right.every((r) => r.result === "right"), JSON.stringify(right));
    assert.deepEqual([...first.errors, ...second.errors], []);
  });
}
